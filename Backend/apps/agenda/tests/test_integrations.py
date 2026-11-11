from datetime import timedelta
from decimal import Decimal as D
from unittest.mock import patch
from negocio import models as m
from apps.finanzas.models import IdempotencyRecord
from .base import AgendaTestCase,API,NOW,START


class IntegrationTests(AgendaTestCase):
    def test_qr_confirmed_arrival_creates_one_visit_without_marking_paid(self):
        appointment=self.reserve()
        arrival=m.Llegadas.objects.create(clienta=self.person,origen='MANUAL',estado='CONFIRMADA',confirmada_en=NOW)
        with patch('django.utils.timezone.now',return_value=START):
            response=self.call('citas/'+str(appointment)+'/vincular-llegada/',{'llegada_id':arrival.pk},status=200)
        visit=response.json()['visita_id']
        self.assertEqual(m.Citas.objects.get(pk=appointment).visita_id,visit)
        self.assertEqual(m.Visitas.objects.get(pk=visit).llegada_id,arrival.pk)
        self.assertEqual(m.Pagos.objects.count(),0)
        self.assertEqual(m.Citas.objects.get(pk=appointment).estado,'PROGRAMADA')
        self.call('citas/'+str(appointment)+'/completar/',status=409)
        self.call('citas/'+str(appointment)+'/cancelar/',{'motivo':'No cancelar atendida'},status=409)

    def test_other_client_or_pending_arrival_never_creates_or_links_visit(self):
        appointment=self.reserve()
        arrival=m.Llegadas.objects.create(clienta=self.person,origen='MANUAL')
        with patch('django.utils.timezone.now',return_value=START):
            self.call('citas/'+str(appointment)+'/vincular-llegada/',{'llegada_id':arrival.pk},status=409)
        self.assertEqual(m.Visitas.objects.count(),0)
        from apps.clientas import services
        other=services.save_clienta({'nombres':'Otra','apellidos':'Ficticia','telefono':'+51988123456'},self.admin)
        arrival.clienta=other
        arrival.estado='CONFIRMADA'
        arrival.confirmada_en=NOW
        arrival.save()
        with patch('django.utils.timezone.now',return_value=START):
            self.call('citas/'+str(appointment)+'/vincular-llegada/',{'llegada_id':arrival.pk},status=409)
        self.assertEqual(m.Visitas.objects.count(),0)

    def test_completion_requires_coherent_finalized_visit_and_confirmed_sale(self):
        appointment=self.reserve()
        arrival=m.Llegadas.objects.create(clienta=self.person,origen='MANUAL',estado='CONFIRMADA',confirmada_en=NOW)
        with patch('django.utils.timezone.now',return_value=START):
            visit=self.call('citas/'+str(appointment)+'/vincular-llegada/',{'llegada_id':arrival.pk},status=200).json()['visita_id']
            sale=self.sale([self.service_line(self.item)],visit)
            detail=self.detail(sale)['lineas'][0]['id']
            self.assertEqual(self.confirm(sale,[{'detalle_id':detail,'insumos':[]}]).status_code,200)
            self.call('citas/'+str(appointment)+'/completar/',status=200)
        self.assertEqual(m.Citas.objects.get(pk=appointment).estado,'COMPLETADA')
        self.assertEqual(m.Pagos.objects.count(),0)
        report=self.client.get('/api/v1/analytics/overview/',{'desde':START.date().isoformat(),'hasta':(START+timedelta(days=1)).date().isoformat()})
        self.assertEqual(report.status_code,200)
        self.assertEqual(report.json()['indicadores']['ventas_confirmadas'],'80.00')
        self.assertEqual(report.json()['indicadores']['saldo_pendiente'],'80.00')

    def test_waitlist_manual_offer_atomic_conversion_with_auditable_reference(self):
        data={'clienta_id':self.person.pk,'servicio_id':self.item.pk,'profesional_id':self.prof,'fecha_deseada':START.date().isoformat(),'franja_inicio':'10:00','franja_fin':'12:00'}
        entry=self.call('lista-espera/',data,status=201).json()['espera_id']
        self.call('lista-espera/',data,status=409)
        self.call('lista-espera/'+str(entry)+'/oferta-manual/',{'oferta_registrada_manualmente':True},status=200)
        self.assertEqual(m.Citas.objects.count(),0)
        self.call('lista-espera/'+str(entry)+'/convertir/',{'inicio_en':(START+timedelta(hours=3)).isoformat()},status=400)
        response=self.call('lista-espera/'+str(entry)+'/convertir/',{'inicio_en':START.isoformat()},status=201)
        self.assertEqual(m.ListaEspera.objects.get(pk=entry).estado,'CONVERTIDA')
        self.assertEqual(self.client.get(API+'lista-espera/'+str(entry)+'/').json()['cita_id'],response.json()['cita_id'])
        self.call('lista-espera/'+str(entry)+'/convertir/',{'inicio_en':START.isoformat()},status=409)
        self.assertEqual(m.NotificacionesCita.objects.count(),0)

    def test_failure_after_insert_rolls_back_appointment_children_history_and_key(self):
        before=IdempotencyRecord.objects.count()
        with patch('apps.agenda.application.bookings.record',side_effect=RuntimeError('Fallo controlado')):
            with self.assertRaises(RuntimeError):self.call('citas/',self.booking())
        self.assertEqual(m.Citas.objects.count(),0)
        self.assertEqual(m.CitaServicios.objects.count(),0)
        self.assertEqual(m.CitaEstadosHistorial.objects.count(),0)
        self.assertEqual(IdempotencyRecord.objects.count(),before)

    def test_reschedule_collision_rolls_back_all_changes(self):
        one=self.reserve()
        two=self.reserve(start=START+timedelta(hours=2))
        self.call('citas/'+str(one)+'/reprogramar/',{'inicio_en':(START+timedelta(hours=2)).isoformat(),'servicios':[self.item.pk],'motivo':'Cambio ficticio ocupado'},status=409)
        self.assertEqual(m.Citas.objects.get(pk=one).inicio_en,START)
        self.assertEqual(m.CitaServicios.objects.filter(cita_id=one).count(),1)
