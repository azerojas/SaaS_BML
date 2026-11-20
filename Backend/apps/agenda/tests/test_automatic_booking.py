from datetime import timedelta
import uuid
from django.test import override_settings
from django.db import connection
from apps.agenda.models import DailySchedule,PublicBookingRequest
from negocio import models as m
from .base import AgendaTestCase,START
from . import test_public_booking as public_tests

ROOT='/api/v1/public/reservas/'


@override_settings(AGENDA_AUTO_CONFIRM_PUBLIC_BOOKINGS=True,AGENDA_BOOKING_SLOT_MINUTES=60,
    AGENDA_PUBLIC_WRITE_ENABLED=True,AGENDA_REQUIRE_DEPOSITS=False,
    PRIVACY_NOTICE_URL='https://example.test/privacidad',PRIVACY_NOTICE_VERSION='test-v1')
class AutomaticBookingTests(AgendaTestCase):
    browser=public_tests.PublicBookingTests.browser
    post=public_tests.PublicBookingTests.post
    payload=public_tests.PublicBookingTests.payload
    reserve_public=public_tests.PublicBookingTests.reserve_public
    def _fixture_teardown(self):
        assert connection.settings_dict['NAME'].startswith('test_lasheo_phase1_')
        with connection.cursor() as cursor:
            cursor.execute('TRUNCATE agenda_publicbookingrequest, agenda_publicbookingintent RESTART IDENTITY')
        super()._fixture_teardown()

    def setUp(self):
        super().setUp()
        self.item.visible_catalogo=True
        self.item.duracion_minutos=150
        self.item.save(update_fields=['visible_catalogo','duracion_minutos'])
        self.public=self.browser()

    def test_online_booking_immediately_creates_confirmed_hour_without_payment_or_expiration(self):
        client_count=m.Clientas.objects.count()
        response=self.reserve_public()
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(response.data['estado'],'CONFIRMADA')
        self.assertIsNone(response.data['expira_en'])
        row=PublicBookingRequest.objects.get()
        appointment=m.Citas.objects.get(pk=row.appointment_id)
        self.assertEqual(appointment.estado,'CONFIRMADA')
        self.assertEqual(appointment.origen,'ONLINE')
        self.assertEqual(appointment.fin_en-appointment.inicio_en,timedelta(hours=1))
        self.assertEqual(appointment.precio_total,self.item.precio_base)
        self.assertIsNotNone(appointment.confirmada_en)
        self.assertIsNone(appointment.expira_en)
        self.assertEqual(m.Clientas.objects.count(),client_count+1)
        self.assertFalse(m.Ventas.objects.exists())
        self.assertFalse(m.Pagos.objects.exists())
        self.assertFalse(m.AnticiposCita.objects.exists())
        self.assertNotIn('10:00',[slot['inicio_en'][11:16] for slot in self.get_slots(public=True)['slots']])
        self.assertIn('11:00',[slot['inicio_en'][11:16] for slot in self.get_slots(public=True)['slots']])

    def test_replay_and_recovery_keep_one_confirmed_appointment_and_original_price(self):
        key=str(uuid.uuid4())
        first=self.reserve_public(key)
        self.assertEqual(first.status_code,201,first.data)
        self.item.precio_base='999.00'
        self.item.save(update_fields=['precio_base'])
        self.assertEqual(self.reserve_public(key).json(),first.json())
        self.assertEqual(self.public.get(ROOT+f'intentos/{key}/').json()['result'],first.json())
        self.assertEqual(m.Citas.objects.count(),1)

    def test_occupied_or_unpublished_slot_creates_no_extra_request_or_client(self):
        first=self.reserve_public()
        self.assertEqual(first.status_code,201,first.data)
        count=m.Clientas.objects.count()
        self.assertEqual(self.reserve_public(telefono='+51987654322').status_code,409)
        self.assertEqual(m.Clientas.objects.count(),count)
        self.assertEqual(PublicBookingRequest.objects.count(),1)
        self.assertEqual(m.Citas.objects.count(),1)
        DailySchedule.objects.create(fecha=START.date(),profesional_id=self.prof,franjas=[])
        self.assertEqual(self.reserve_public(inicio_en=(START+timedelta(hours=2)).isoformat()).status_code,409)

    def test_reschedule_and_cancel_release_only_the_correct_slot(self):
        first=self.reserve_public().json()
        new=START+timedelta(hours=2)
        response=self.post(f'solicitudes/{first["id"]}/reprogramar/',{'inicio_en':new.isoformat()},str(uuid.uuid4()))
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data['estado'],'CONFIRMADA')
        starts=[slot['inicio_en'][11:16] for slot in self.get_slots(public=True)['slots']]
        self.assertIn('10:00',starts)
        self.assertNotIn('12:00',starts)
        cancelled=self.post(f'solicitudes/{first["id"]}/cancelar/',{'motivo':'Cambio de planes'},str(uuid.uuid4()))
        self.assertEqual(cancelled.status_code,200,cancelled.data)
        self.assertEqual(m.Citas.objects.get().estado,'CANCELADA')
        self.assertIn('12:00',[slot['inicio_en'][11:16] for slot in self.get_slots(public=True)['slots']])

    def test_existing_active_contact_is_reused_without_changing_its_profile(self):
        original=m.Clientas.objects.get(pk=self.person.pk)
        original.telefono='+51987654321'
        original.save(update_fields=['telefono'])
        before=m.Clientas.objects.count()
        response=self.reserve_public(nombres='Nombre declarado')
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(m.Clientas.objects.count(),before)
        self.assertEqual(m.Citas.objects.get().clienta_id,original.pk)
        original.refresh_from_db()
        self.assertNotEqual(original.nombres,'Nombre declarado')

    def test_two_simultaneous_requests_confirm_only_one_appointment(self):
        public_tests.PublicBookingTests.test_two_parallel_requests_only_one_wins_slot(self)
        self.assertEqual(m.Citas.objects.count(),1)
        self.assertEqual(m.Citas.objects.get().estado,'CONFIRMADA')

    def test_another_specialist_keeps_the_same_hour_available(self):
        from .test_hourly_bookings import HourlyBookingTests
        identifiers=HourlyBookingTests.specialist_slots(self)
        first=self.reserve_public()
        self.assertEqual(first.status_code,201,first.data)
        self.assertEqual(len(self.get_slots(public=True,profesional_id=identifiers[1])['slots']),1)
        second=self.reserve_public(profesional_id=identifiers[1],telefono='+51987654322')
        self.assertEqual(second.status_code,201,second.data)
        self.assertEqual(m.Citas.objects.filter(estado='CONFIRMADA').count(),2)

    def test_confirmation_does_not_expire_after_the_old_review_period(self):
        from unittest.mock import patch
        from .base import NOW
        first=self.reserve_public().json()
        with patch('django.utils.timezone.now',return_value=NOW+timedelta(minutes=31)):
            result=self.public.get(ROOT+f'solicitudes/{first["id"]}/')
            self.assertEqual(result.status_code,200,result.data)
            self.assertEqual(result.data['estado'],'CONFIRMADA')
            self.assertIsNone(result.data['expira_en'])
            self.assertNotIn('10:00',[slot['inicio_en'][11:16] for slot in self.get_slots(public=True)['slots']])
