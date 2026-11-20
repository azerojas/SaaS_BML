from datetime import timedelta
from django.test import override_settings
from apps.agenda.models import DailySchedule
from negocio import models as m
from .base import AgendaTestCase, START
from . import test_public_booking as public_tests


@override_settings(AGENDA_AUTO_CONFIRM_PUBLIC_BOOKINGS=False, AGENDA_BOOKING_SLOT_MINUTES=60, AGENDA_REQUIRE_DEPOSITS=False,
    AGENDA_PUBLIC_WRITE_ENABLED=True, PRIVACY_NOTICE_URL='https://example.test/privacidad',
    PRIVACY_NOTICE_VERSION='test-v1')
class HourlyBookingTests(AgendaTestCase):
    browser = public_tests.PublicBookingTests.browser
    post = public_tests.PublicBookingTests.post
    payload = public_tests.PublicBookingTests.payload
    reserve_public = public_tests.PublicBookingTests.reserve_public

    def setUp(self):
        super().setUp()
        self.item.duracion_minutos=150
        self.item.visible_catalogo=True
        self.item.save(update_fields=['duracion_minutos','visible_catalogo'])
        self.public=self.browser()

    def test_long_treatment_reserves_one_hour_and_keeps_price_and_service_snapshot(self):
        identifier=self.reserve()
        appointment=m.Citas.objects.get(pk=identifier)
        self.assertEqual(appointment.fin_en-appointment.inicio_en,timedelta(hours=1))
        self.assertEqual(appointment.duracion_total_minutos,60)
        self.assertEqual(appointment.precio_total,self.item.precio_base)
        self.assertEqual(appointment.citaservicios_set.get().duracion_minutos,150)
        slots=self.get_slots(public=True)
        self.assertEqual(slots['cupo_minutos'],60)
        self.assertEqual(slots['duracion_minutos'],60)
        starts=[row['inicio_en'][11:16] for row in slots['slots']]
        self.assertNotIn('10:00',starts)
        self.assertIn('11:00',starts)
        self.assertIn('12:00',starts)
        self.assertNotIn('11:15',starts)
        self.assertEqual(self.call('citas/',self.booking()).status_code,409)
        self.reserve(start=START+timedelta(hours=1))

    def test_published_range_becomes_three_independent_hourly_slots(self):
        response=self.call('disponibilidad-diaria/',{'fecha':str(START.date()),'profesional_id':self.prof,
            'franjas':[{'inicio':'10:00','fin':'13:00','cupo_unico':True}]},status=200)
        self.assertEqual([row['inicio'] for row in response.json()['franjas']],['10:00','11:00','12:00'])
        self.assertEqual(len(DailySchedule.objects.get(profesional_id=self.prof).franjas),3)
        self.assertEqual([row['inicio_en'][11:16] for row in self.get_slots()['slots']],['10:00','11:00','12:00'])

    def test_legacy_published_range_is_read_as_independent_hours(self):
        DailySchedule.objects.create(fecha=START.date(),profesional_id=self.prof,
            franjas=[{'inicio':'10:00','fin':'13:00','cupo_unico':True}])
        self.assertEqual([row['inicio_en'][11:16] for row in self.get_slots()['slots']],['10:00','11:00','12:00'])
        self.reserve(start=START+timedelta(hours=1))

    def test_short_or_partial_hour_cannot_silently_close_a_published_day(self):
        self.call('disponibilidad-diaria/',{'fecha':str(START.date()),'profesional_id':self.prof,
            'franjas':[{'inicio':'10:00','fin':'10:30'}]},status=400)
        self.assertFalse(DailySchedule.objects.filter(profesional_id=self.prof).exists())

    def test_reschedule_uses_one_hour_without_changing_historical_price(self):
        with override_settings(AGENDA_BOOKING_SLOT_MINUTES=0):
            identifier=self.reserve()
        start=START+timedelta(hours=3)
        self.call(f'citas/{identifier}/reprogramar/',{'inicio_en':start.isoformat(),'motivo':'Cambio de hora solicitado'},status=200)
        row=m.Citas.objects.get(pk=identifier)
        self.assertEqual(row.fin_en-start,timedelta(hours=1))
        self.assertEqual(row.duracion_total_minutos,60)
        self.assertEqual(row.precio_total,self.item.precio_base)
        self.assertEqual(row.citaservicios_set.get().duracion_minutos,150)

    def test_public_request_holds_only_one_hour_for_long_treatment(self):
        response=self.reserve_public(inicio_en=START.isoformat())
        self.assertEqual(response.status_code,201,response.data)
        row=m.Citas.objects.filter(inicio_en=START).first()
        self.assertIsNone(row)
        from apps.agenda.models import PublicBookingRequest
        request=PublicBookingRequest.objects.get(pk=response.json()['id'])
        self.assertEqual(request.fin_en-request.inicio_en,timedelta(hours=1))
        self.assertEqual(request.precio_total,self.item.precio_base)
        starts=[row['inicio_en'][11:16] for row in self.get_slots(public=True)['slots']]
        self.assertNotIn('10:00',starts)
        self.assertIn('11:00',starts)

    def specialist_slots(self):
        identifiers=[self.prof]
        for name in ('Segunda','Tercera'):
            identifier=self.call('profesionales/',{'nombres':name,'apellidos':'Prueba','visible_reservas':True},status=201).json()['profesional_id']
            self.call(f'profesionales/{identifier}/especialidades/',{'servicios':[self.item.pk]},method='put',status=200)
            identifiers.append(identifier)
        for identifier in identifiers:
            DailySchedule.objects.create(fecha=START.date(),profesional_id=identifier,
                franjas=[{'inicio':'10:00','fin':'11:00','cupo_unico':True}])
        return identifiers

    def assert_only_first_specialist_occupied(self,identifiers):
        from apps.agenda.application.daily_schedule import outputs
        rows=outputs(DailySchedule.objects.filter(fecha=START.date()).order_by('profesional_id'))
        self.assertEqual([row['franjas'][0]['ocupado'] for row in rows],[True,False,False])
        for index,identifier in enumerate(identifiers):
            slots=self.get_slots(public=True,profesional_id=identifier)['slots']
            self.assertEqual(len(slots),0 if index==0 else 1)

    def test_confirmed_appointment_does_not_block_other_specialists(self):
        identifiers=self.specialist_slots()
        identifier=self.reserve()
        self.call(f'citas/{identifier}/confirmar/',status=200)
        self.assert_only_first_specialist_occupied(identifiers)
        self.assertEqual(list(m.Citas.objects.values_list('profesional_id',flat=True)),[identifiers[0]])

    def test_public_request_holds_selected_specialist_only_and_other_can_book_same_hour(self):
        identifiers=self.specialist_slots()
        response=self.reserve_public(inicio_en=START.isoformat())
        self.assertEqual(response.status_code,201,response.data)
        self.assert_only_first_specialist_occupied(identifiers)
        second=self.reserve_public(inicio_en=START.isoformat(),profesional_id=identifiers[1],telefono='+51977123452')
        self.assertEqual(second.status_code,201,second.data)
        from apps.agenda.models import PublicBookingRequest
        self.assertEqual(list(PublicBookingRequest.objects.order_by('creada_en').values_list('profesional_id',flat=True)),identifiers[:2])

    def test_calendar_explains_pending_request_and_expiration_releases_its_slot(self):
        from apps.agenda.application.daily_schedule import outputs
        from apps.agenda.models import PublicBookingRequest
        from .base import NOW
        identifiers=self.specialist_slots()
        response=self.reserve_public(inicio_en=START.isoformat())
        self.assertEqual(response.status_code,201,response.data)
        def calendar():
            return outputs(DailySchedule.objects.filter(fecha=START.date()).order_by('profesional_id'))
        rows=calendar()
        first=rows[0]['franjas'][0]
        self.assertTrue(first['ocupado'])
        self.assertEqual(first['solicitud_pendiente']['id'],response.json()['id'])
        self.assertEqual(first['solicitud_pendiente']['clienta_nombre'],'Nueva Clienta')
        self.assertNotIn('solicitud_pendiente',rows[1]['franjas'][0])
        PublicBookingRequest.objects.filter(pk=response.json()['id']).update(expira_en=NOW)
        first=calendar()[0]['franjas'][0]
        self.assertFalse(first['ocupado'])
        self.assertNotIn('solicitud_pendiente',first)
        self.assertEqual(len(self.get_slots(public=True,profesional_id=identifiers[0])['slots']),1)

    def test_hour_missing_from_published_calendar_cannot_be_requested(self):
        DailySchedule.objects.create(fecha=START.date(),profesional_id=self.prof,
            franjas=[{'inicio':'11:00','fin':'12:00','cupo_unico':True}])
        self.assertEqual([row['inicio_en'][11:16] for row in self.get_slots(public=True)['slots']],['11:00'])
        self.assertEqual(self.reserve_public(inicio_en=START.isoformat()).status_code,409)
        self.assertEqual(self.call('citas/',self.booking()).status_code,409)
