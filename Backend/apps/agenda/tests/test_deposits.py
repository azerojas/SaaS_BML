from datetime import timedelta
from decimal import Decimal as D
from unittest.mock import patch
from io import StringIO
from django.core.management import call_command
from django.db import connection
from negocio import models as m
from .base import AgendaTestCase,API,NOW,START


class DepositTests(AgendaTestCase):
    def pending(self):
        m.Servicios.objects.filter(pk=self.item.pk).update(requiere_anticipo=True)
        return self.reserve()

    def advance(self,appointment,monto='16.00'):
        return self.mutate('anticipos/',{'cita_id':appointment,'metodo':'EFECTIVO','monto':monto},expected=201).json()['anticipo_id']

    def confirm_advance(self,pk,status=200):
        return self.mutate('anticipos/'+str(pk)+'/confirmar/',{'verificado_manualmente':True},expected=status)

    def test_required_deposit_manual_confirmation_promotes_once_no_payments(self):
        appointment=self.pending()
        obj=m.Citas.objects.get(pk=appointment)
        self.assertEqual(obj.estado,'PENDIENTE_PAGO')
        self.assertEqual(obj.anticipo_requerido,D('16.00'))
        self.call('citas/'+str(appointment)+'/confirmar/',status=409)
        part=self.advance(appointment,'10.00')
        self.confirm_advance(part)
        self.assertEqual(m.Citas.objects.get(pk=appointment).estado,'PENDIENTE_PAGO')
        other=self.advance(appointment,'6.00')
        self.confirm_advance(other)
        self.assertEqual(m.Citas.objects.get(pk=appointment).estado,'PROGRAMADA')
        self.assertEqual(m.Pagos.objects.count(),0)
        self.assertEqual(m.CitaEstadosHistorial.objects.filter(cita_id=appointment).count(),2)

    def test_expired_pending_stays_occupied_until_real_expiration_then_reusable(self):
        appointment=self.pending()
        m.Citas.objects.filter(pk=appointment).update(expira_en=NOW-timedelta(minutes=1))
        self.assertNotEqual(self.get_slots()['slots'][0]['inicio_en'],START.isoformat())
        output=StringIO()
        call_command('expirar_citas',stdout=output)
        self.assertEqual(m.Citas.objects.get(pk=appointment).estado,'EXPIRADA')
        self.assertEqual(self.get_slots()['slots'][0]['inicio_en'],START.isoformat())
        call_command('expirar_citas',stdout=StringIO())
        self.assertEqual(m.CitaEstadosHistorial.objects.filter(cita_id=appointment).count(),2)
        self.reserve()

    def test_late_payment_never_reopens_expired_slot_or_records_cash(self):
        appointment=self.pending()
        advance=self.advance(appointment)
        m.Citas.objects.filter(pk=appointment).update(expira_en=NOW)
        self.confirm_advance(advance,409)
        self.assertEqual(m.AnticiposCita.objects.get(pk=advance).estado,'PENDIENTE')
        call_command('expirar_citas',stdout=StringIO())
        self.confirm_advance(advance,409)
        self.assertEqual(m.Pagos.objects.count(),0)

    def test_partial_money_at_expiration_is_retained_with_incident_not_refunded(self):
        appointment=self.pending()
        advance=self.advance(appointment,'5.00')
        self.confirm_advance(advance)
        m.Citas.objects.filter(pk=appointment).update(expira_en=NOW)
        call_command('expirar_citas',stdout=StringIO())
        self.assertEqual(m.AnticiposCita.objects.get(pk=advance).estado,'CONFIRMADO')
        self.assertTrue(m.Auditoria.objects.filter(entidad='citas',entidad_id=str(appointment),accion='INCIDENCIA_ANTICIPO').exists())
        self.assertEqual(m.Citas.objects.get(pk=appointment).estado,'EXPIRADA')

    def test_reschedule_additional_deposit_transition_is_atomic(self):
        appointment=self.reserve()
        m.Servicios.objects.filter(pk=self.item.pk).update(requiere_anticipo=True)
        self.call('citas/'+str(appointment)+'/reprogramar/',{'inicio_en':(START+timedelta(hours=2)).isoformat(),'servicios':[self.item.pk],'motivo':'Cambio servicio ficticio'},status=200)
        obj=m.Citas.objects.get(pk=appointment)
        self.assertEqual(obj.estado,'PENDIENTE_PAGO')
        self.assertIsNotNone(obj.expira_en)
        self.confirm_advance(self.advance(appointment))
        self.assertEqual(m.Citas.objects.get(pk=appointment).estado,'PROGRAMADA')
