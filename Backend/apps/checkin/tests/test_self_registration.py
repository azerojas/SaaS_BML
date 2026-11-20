from unittest.mock import patch
from django.utils import timezone
from negocio import models as m
from apps.checkin.application.selectors import provisional
from .base import CheckinTestCase, PUBLIC


class SelfRegistrationTests(CheckinTestCase):
    def fresh(self, **changes):
        return self.post(nombres='Nueva', apellidos='Ficticia',
                         consentimiento_datos=True, version_aviso='v1', **changes)

    def test_get_only_opens_form_and_never_creates_records(self):
        self.person()
        response = self.public.get(self.url)
        self.assertFalse(response.json()['requiere_confirmacion_presencial'])
        self.assertFalse(m.Visitas.objects.exists())
        self.assertFalse(m.Llegadas.objects.exists())

    def test_known_client_opens_visit_without_staff_confirmation_or_financial_writes(self):
        client = self.person()
        self.assertEqual(self.post().status_code, 202)
        visit = m.Visitas.objects.get()
        self.assertEqual(visit.clienta_id, client.pk)
        self.assertEqual(visit.estado, 'ABIERTA')
        self.assertIsNone(visit.creada_por_id)
        self.assertEqual(visit.llegada.estado, 'CONFIRMADA')
        self.assertIsNone(visit.llegada.confirmada_por_id)
        event = m.Auditoria.objects.get(accion='REGISTRAR_QR_AUTOMATICO')
        self.assertFalse(event.datos['identidad_verificada'])
        for model in (m.Ventas, m.Pagos, m.MovimientosInventario, m.ConsumosServicio):
            self.assertFalse(model.objects.exists())

    def test_new_client_records_explicit_consent_without_claiming_identity_verified(self):
        self.assertEqual(self.fresh().status_code, 202)
        client = m.Clientas.objects.get()
        self.assertTrue(client.activa)
        self.assertTrue(client.consentimiento_datos)
        self.assertIsNotNone(client.consentimiento_fecha)
        self.assertFalse(client.acepta_recordatorios)
        self.assertFalse(provisional(client))
        self.assertEqual(m.Visitas.objects.get().clienta_id, client.pk)
        event = m.Auditoria.objects.get(accion='ALTA_QR_AUTONOMA')
        self.assertEqual(event.datos['version_aviso'], 'v1')
        self.assertFalse(event.datos['identidad_verificada'])

    def test_retries_and_other_qr_points_reuse_open_visit(self):
        self.fresh()
        first = m.Visitas.objects.get().pk
        self.post()
        other = m.PuntosQr.objects.create(nombre='Otra entrada')
        response = self.public.post(PUBLIC + str(other.token) + '/',
                                    {'telefono': '+51999123456'}, format='json')
        self.assertEqual(response.status_code, 202)
        self.assertEqual(m.Visitas.objects.get().pk, first)
        self.assertEqual(m.Llegadas.objects.count(), 1)
        self.assertEqual(m.Clientas.objects.count(), 1)

    def test_an_existing_manual_open_visit_is_reused(self):
        client = self.person()
        original = m.Visitas.objects.create(clienta_id=client.pk)
        self.post()
        self.assertEqual(m.Visitas.objects.get().pk, original.pk)
        self.assertFalse(m.Llegadas.objects.exists())

    def test_new_visit_after_previous_visit_is_finished_preserves_history(self):
        self.fresh()
        first = m.Visitas.objects.get()
        first.estado = 'FINALIZADA'
        first.fin_en = timezone.now()
        first.save(update_fields=['estado', 'fin_en'])
        self.post()
        self.assertEqual(m.Visitas.objects.count(), 2)
        self.assertEqual(m.Visitas.objects.filter(estado='ABIERTA').count(), 1)
        self.assertEqual(m.Llegadas.objects.count(), 2)

    def test_legacy_proposal_requires_current_declared_consent_before_automatic_visit(self):
        legacy = self.propose()
        self.post()
        self.assertFalse(m.Visitas.objects.exists())
        self.fresh()
        client = m.Clientas.objects.get()
        self.assertTrue(client.activa)
        self.assertFalse(provisional(client))
        self.assertEqual(client.nombres, 'Daniela')
        self.assertEqual(m.Visitas.objects.get().llegada_id, legacy.pk)

    def test_inactive_or_unknown_phone_does_not_create_visit_or_reveal_identity(self):
        unknown = self.post()
        client = self.person()
        m.Clientas.objects.filter(pk=client.pk).update(activa=False)
        inactive = self.post()
        self.assertEqual(unknown.json(), inactive.json())
        self.assertEqual(inactive.status_code, 202)
        self.assertFalse(m.Visitas.objects.exists())
        client.refresh_from_db()
        self.assertFalse(client.activa)

    def test_failure_rolls_back_client_consent_arrival_and_visit(self):
        with patch('apps.checkin.application.commands.audit', side_effect=RuntimeError('synthetic')):
            with self.assertRaises(RuntimeError):
                self.fresh()
        self.assertFalse(m.Clientas.objects.exists())
        self.assertFalse(m.Llegadas.objects.exists())
        self.assertFalse(m.Visitas.objects.exists())
