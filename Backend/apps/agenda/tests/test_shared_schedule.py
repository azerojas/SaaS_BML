from datetime import timedelta
import uuid
from django.db import connection, transaction, IntegrityError
from apps.agenda.models import DailySchedule
from negocio import models as m
from .base import AgendaTestCase, START, API
from apps.reporting.tests.base import ReportTestCase


class EmptySalonScheduleTests(ReportTestCase):
    def test_save_without_any_professional_client_or_service_reference(self):
        self.assertEqual(m.Profesionales.objects.count(), 0)
        from django.utils import timezone
        from apps.agenda.domain.rules import ZONE
        day = (timezone.now().astimezone(ZONE).date() + timedelta(days=1)).isoformat()
        payload = {'fecha': day, 'franjas': [{'inicio': '09:15', 'fin': '17:45'}]}
        key = str(uuid.uuid4())
        for _ in range(2):
            response = self.client.post(API + 'disponibilidad-diaria/', payload, format='json', HTTP_IDEMPOTENCY_KEY=key)
            self.assertEqual(response.status_code, 200, response.data)
            self.assertIsNone(response.data['profesional_id'])
        self.assertEqual(DailySchedule.objects.count(), 1)
        self.assertEqual(m.Profesionales.objects.count(), 0)
        self.assertEqual(m.Citas.objects.count(), 0)
        with self.assertRaises(IntegrityError), transaction.atomic():
            DailySchedule.objects.create(fecha=day, profesional_id=None, franjas=[])


class SharedScheduleTests(AgendaTestCase):
    def set_shared(self, hours):
        return self.call('disponibilidad-diaria/', {'fecha': START.date().isoformat(), 'franjas': hours})

    def test_general_applies_without_erasing_individual_schedule(self):
        response = self.set_shared([{'inicio': '09:00', 'fin': '12:00'}])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.get_slots()['slots'][0]['inicio_en'], START.replace(hour=9).isoformat())
        self.call('disponibilidad-diaria/', {'fecha': START.date().isoformat(), 'profesional_id': self.prof,
                  'franjas': [{'inicio': '15:00', 'fin': '18:00'}]}, status=200)
        self.assertEqual(self.get_slots()['slots'][0]['inicio_en'], START.replace(hour=15).isoformat())
        self.assertEqual(DailySchedule.objects.count(), 2)
        result = self.client.get(API + 'disponibilidad-diaria/', {'desde': START.date().isoformat(),
            'hasta': (START + timedelta(days=1)).date().isoformat(), 'ambito': 'general'})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data['count'], 1)
        self.assertIsNone(result.data['results'][0]['profesional_id'])

    def test_general_change_protects_bookings_and_restoration_checks_weekly_coverage(self):
        self.set_shared([{'inicio': '09:00', 'fin': '12:00'}])
        self.call('citas/', self.booking(start=START.replace(hour=9)), status=201)
        self.assertEqual(self.set_shared([]).status_code, 409)
        self.call('disponibilidad-diaria/restablecer/', {'fecha': START.date().isoformat()}, status=409)
        self.assertTrue(DailySchedule.objects.filter(profesional_id__isnull=True).exists())

    def test_individual_override_keeps_coverage_when_general_day_closes(self):
        self.call('disponibilidad-diaria/', {'fecha': START.date().isoformat(), 'profesional_id': self.prof,
                  'franjas': [{'inicio': '10:00', 'fin': '18:00'}]}, status=200)
        self.reserve()
        self.assertEqual(self.set_shared([]).status_code, 200)
        self.assertTrue(self.get_slots()['slots'])

    def test_shared_permissions_are_the_existing_schedule_permissions(self):
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.set_shared([]).status_code, 403)
