from datetime import timedelta
from unittest.mock import patch
from django.conf import settings
from django.db import connection, IntegrityError, transaction
from django.test import override_settings
from django.utils import timezone
from negocio import models as m
from .base import ADMIN, CheckinTestCase


class WorkflowTests(CheckinTestCase):
    def test_only_one_visit_and_no_financial_side_effects(self):
        arrival=self.propose()
        self.confirm(arrival)
        first=self.client.post(self.path(arrival,'crear-visita'),{},format='json')
        self.assertEqual(first.status_code,200,first.data)
        second=self.client.post(self.path(arrival,'crear-visita'),{},format='json')
        self.assertEqual(first.json(),second.json())
        visit=m.Visitas.objects.get()
        self.assertEqual(visit.clienta_id,arrival.clienta_id)
        self.assertEqual(visit.estado,'ABIERTA')
        self.assertEqual(visit.creada_por_id,self.admin.pk)
        self.assertEqual(m.Ventas.objects.count(),0)
        self.assertEqual(m.MovimientosInventario.objects.count(),0)
        self.assertEqual(m.Pagos.objects.count(),0)
        self.assertEqual(m.ConsumosServicio.objects.count(),0)
        with self.assertRaises(IntegrityError),transaction.atomic():
            m.Visitas.objects.create(clienta_id=arrival.clienta_id,llegada_id=arrival.pk)

    def test_existing_visit_must_match_identity_and_open_state(self):
        arrival=self.propose()
        self.confirm(arrival)
        other=self.person('+51999123458')
        incompatible=m.Visitas.objects.create(clienta_id=other.pk)
        own=m.Visitas.objects.create(clienta_id=arrival.clienta_id)
        path=self.path(arrival,'asociar-visita')
        self.assertEqual(self.client.post(path,{'visita_id':incompatible.pk},format='json').status_code,409)
        self.assertEqual(self.client.post(path,{'visita_id':own.pk},format='json').status_code,200)
        self.assertEqual(self.client.post(self.path(arrival,'crear-visita'),{},format='json').json()['id'],own.pk)
        self.assertEqual(m.Visitas.objects.count(),2)

    def test_confirmation_failure_rolls_back_consent_activation_and_state(self):
        arrival=self.propose()
        with patch('apps.checkin.application.commands.audit',side_effect=RuntimeError('Fallo ficticio')):
            with self.assertRaises(RuntimeError):self.confirm(arrival)
        arrival.refresh_from_db()
        self.assertEqual(arrival.estado,'PENDIENTE')
        self.assertFalse(arrival.clienta.activa)
        self.assertFalse(arrival.clienta.consentimiento_datos)

    def test_old_notice_needs_new_declaration_then_human_review(self):
        arrival=self.propose()
        with override_settings(CHECKIN_PRIVACY_NOTICE_VERSION='v2'):
            self.assertEqual(self.confirm(arrival).status_code,400)
            self.assertEqual(self.post(nombres='No cambia',apellidos='Tercero',consentimiento_datos=True,version_aviso='v2').status_code,202)
            self.assertEqual(self.confirm(arrival).status_code,200)
        self.assertEqual(m.Clientas.objects.get(pk=arrival.clienta_id).nombres,'Daniela')

    def test_sql_pending_unique_is_global_across_points(self):
        person=self.person()
        self.post()
        other=m.PuntosQr.objects.create(nombre='Otro punto')
        with self.assertRaises(IntegrityError),transaction.atomic():
            m.Llegadas.objects.create(clienta_id=person.pk,punto_qr_id=other.pk,origen='QR')

    def appointment(self,client_id,offset=0):
        now=timezone.now()+timedelta(minutes=offset)
        with connection.cursor() as c:
            c.execute("INSERT INTO profesionales(nombres,apellidos) VALUES ('Profesional','Ficticia') RETURNING id")
            professional=c.fetchone()[0]
            c.execute('INSERT INTO citas(clienta_id,profesional_id,inicio_en,fin_en) VALUES (%s,%s,%s,%s) RETURNING id',
                      [client_id,professional,now,now+timedelta(minutes=30)])
            return c.fetchone()[0]

    def test_appointment_suggestion_and_explicit_link_do_not_charge_or_change_state(self):
        person=self.person()
        appointment=self.appointment(person.pk)
        self.post()
        arrival=m.Llegadas.objects.get()
        detail=self.client.get(self.path(arrival)).json()
        self.assertEqual([row['id'] for row in detail['citas_sugeridas']],[appointment])
        self.assertIsNone(m.Citas.objects.get(pk=appointment).visita_id)
        self.confirm(arrival)
        visit=self.client.post(self.path(arrival,'crear-visita'),{},format='json').json()
        response=self.client.post(self.path(arrival,'enlazar-cita'),{'cita_id':appointment},format='json')
        self.assertEqual(response.status_code,200,response.data)
        ap=m.Citas.objects.get(pk=appointment)
        self.assertEqual(ap.visita_id,visit['id'])
        self.assertEqual(ap.estado,'PROGRAMADA')
        self.assertEqual(m.Ventas.objects.count(),0)
        self.assertEqual(m.Pagos.objects.count(),0)
        self.assertEqual(self.client.post(self.path(arrival,'enlazar-cita'),{'cita_id':appointment},format='json').status_code,200)

    def test_incompatible_or_distant_appointment_cannot_be_linked(self):
        arrival=self.propose()
        self.confirm(arrival)
        self.client.post(self.path(arrival,'crear-visita'),{},format='json')
        other=self.person('+51999123458')
        wrong=self.appointment(other.pk)
        far=self.appointment(arrival.clienta_id,offset=1440)
        for pk in [wrong,far]:
            self.assertEqual(self.client.post(self.path(arrival,'enlazar-cita'),{'cita_id':pk},format='json').status_code,409)

