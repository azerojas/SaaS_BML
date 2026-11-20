from datetime import timedelta
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.db import connection, connections
from django.test import override_settings
from rest_framework.test import APIClient
from apps.agenda.models import DailySchedule, PublicBookingRequest
from apps.agenda.application import public_booking
from apps.agenda.infrastructure.transactions import agenda_transaction
from negocio import models as m
from .base import AgendaTestCase, START, API
from . import test_public_booking as public_tests


@override_settings(AGENDA_PUBLIC_WRITE_ENABLED=True, AGENDA_REQUIRE_DEPOSITS=False,
    PRIVACY_NOTICE_URL='https://example.test/privacidad', PRIVACY_NOTICE_VERSION='test-v1')
class PublishedSlotTests(AgendaTestCase):
    browser = public_tests.PublicBookingTests.browser
    post = public_tests.PublicBookingTests.post
    payload = public_tests.PublicBookingTests.payload
    reserve_public = public_tests.PublicBookingTests.reserve_public
    approve = public_tests.PublicBookingTests.approve
    def _fixture_teardown(self):
        assert connection.settings_dict['NAME'].startswith('test_lasheo_phase1_')
        with connection.cursor() as cursor:
            cursor.execute('TRUNCATE agenda_publicbookingrequest, agenda_publicbookingintent RESTART IDENTITY')
        super()._fixture_teardown()

    def setUp(self):
        super().setUp()
        self.item.visible_catalogo=True
        self.item.save(update_fields=['visible_catalogo'])
        self.specialist=get_user_model().objects.create_user('publishing_specialist',is_staff=True)
        self.specialist.user_permissions.add(*Permission.objects.filter(content_type__app_label='agenda',codename__in=['view_own_agenda','manage_own_schedule']))
        m.Profesionales.objects.filter(pk=self.prof).update(usuario=self.specialist)
        self.owner=APIClient()
        self.owner.force_authenticate(self.specialist)
        self.public=self.browser()
        self.windows=[{'inicio':'14:00','fin':'16:00'},{'inicio':'16:00','fin':'18:00'},{'inicio':'18:00','fin':'20:00'}]
        self.start=START.replace(hour=14)

    def publish(self,windows=None,**changes):
        return self.owner.post(API+'disponibilidad-diaria/',{'fecha':START.date().isoformat(),'franjas':self.windows if windows is None else windows,**changes},format='json',HTTP_IDEMPOTENCY_KEY=str(uuid4()))

    def slots(self,professional=None):
        response=self.public.get('/api/v1/public/agenda/disponibilidad/',{'fecha':START.date().isoformat(),'profesional_id':professional or self.prof,'servicios':str(self.item.pk)})
        self.assertEqual(response.status_code,200,response.data)
        return [row['inicio_en'][11:16] for row in response.json()['slots']]

    def test_publishing_creates_three_independent_slots_and_no_appointments_or_sales(self):
        response=self.publish()
        self.assertEqual(response.status_code,200,response.data)
        row=DailySchedule.objects.get(profesional_id=self.prof)
        self.assertEqual(len(row.franjas),3)
        self.assertTrue(all(item['cupo_unico'] for item in row.franjas))
        self.assertEqual(self.slots(),['14:00','16:00','18:00'])
        self.assertFalse(m.Citas.objects.exists())
        self.assertFalse(m.Ventas.objects.exists())
        self.assertFalse(m.Visitas.objects.exists())
        self.assertEqual(m.Clientas.objects.count(),1)

    def test_treatment_cannot_remove_person_with_pending_public_request(self):
        self.assertEqual(self.publish().status_code,200)
        response=self.reserve_public(inicio_en=self.start.isoformat())
        self.assertEqual(response.status_code,201,response.data)
        rejected=self.client.patch('/api/admin/catalogo/servicios/'+str(self.item.pk)+'/',
            {'profesionales_ids':[]},format='json')
        self.assertEqual(rejected.status_code,409,rejected.data)
        self.assertTrue(m.ProfesionalServicios.objects.filter(servicio_id=self.item.pk,profesional_id=self.prof).exists())

    def test_unpublished_day_does_not_inherit_general_or_weekly_public_availability(self):
        DailySchedule.objects.create(fecha=START.date(),profesional_id=None,franjas=[{'inicio':'09:00','fin':'20:00'}])
        self.assertEqual(self.slots(),[])
        self.assertEqual(self.reserve_public(inicio_en=self.start.isoformat()).status_code,409)

    def test_hourly_starts_are_not_merged_when_admin_publishes_for_specialist(self):
        windows=[{'inicio':f'{hour}:00','fin':f'{hour+1}:00'} for hour in (16,17,18)]
        response=self.call('disponibilidad-diaria/',{'fecha':str(START.date()),'profesional_id':self.prof,'franjas':windows})
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(len(response.json()['franjas']),3)
        self.assertTrue(all(row['cupo_unico'] for row in response.json()['franjas']))
        self.assertEqual(self.slots(),['16:00','17:00','18:00'])
        self.assertEqual(self.reserve_public(inicio_en=START.replace(hour=16,minute=15).isoformat()).status_code,409)

    def test_legacy_personal_window_only_offers_its_published_start(self):
        DailySchedule.objects.create(fecha=START.date(),profesional_id=self.prof,franjas=[{'inicio':'16:00','fin':'19:00'}])
        self.assertEqual(self.slots(),['16:00'])
        self.assertEqual(self.reserve_public(inicio_en=START.replace(hour=17).isoformat()).status_code,409)

    def test_owner_cannot_publish_for_another_specialist_or_change_general_hours(self):
        other=m.Profesionales.objects.create(nombres='Otra',apellidos='Especialista',activa=True)
        self.assertEqual(self.publish(profesional_id=other.pk).status_code,403)
        self.assertEqual(self.publish(profesional_id=None).status_code,200)
        self.assertFalse(DailySchedule.objects.filter(profesional_id__isnull=True).exists())
        self.assertEqual(self.owner.post(API+'disponibilidad-diaria/restablecer/',{'fecha':str(START.date())},format='json').status_code,403)

    def test_short_service_consumes_the_entire_slot_and_cannot_start_inside_it(self):
        self.assertEqual(self.publish().status_code,200)
        response=self.reserve_public(inicio_en=self.start.isoformat())
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(self.slots(),['16:00','18:00'])
        self.assertEqual(self.reserve_public(inicio_en=self.start.isoformat()).status_code,409)
        self.assertEqual(self.reserve_public(inicio_en=(self.start+timedelta(minutes=15)).isoformat()).status_code,409)
        self.assertEqual(self.call('citas/',self.booking(start=self.start)).status_code,409)
        rows=self.owner.get(API+'disponibilidad-diaria/',{'desde':str(START.date()),'hasta':str(START.date()+timedelta(days=1))}).json()['results']
        self.assertEqual([item['ocupado'] for item in rows[0]['franjas']],[True,False,False])

    def test_cancelled_request_releases_slot_and_booked_slot_cannot_be_removed(self):
        self.publish()
        response=self.reserve_public(inicio_en=self.start.isoformat())
        identifier=response.json()['id']
        self.assertEqual(self.publish(self.windows[1:]).status_code,409)
        cancelled=self.post(f'solicitudes/{identifier}/cancelar/',{'motivo':'Cambio de planes de demostracion'},key=str(uuid4()))
        self.assertEqual(cancelled.status_code,200,cancelled.data)
        self.assertEqual(self.slots(),['14:00','16:00','18:00'])
        self.assertEqual(self.publish(self.windows[1:]).status_code,200)

    def test_staff_approval_keeps_capacity_one_even_when_service_is_shorter(self):
        self.publish()
        response=self.reserve_public(inicio_en=self.start.isoformat())
        approved=self.approve(response.json()['id'])
        self.assertEqual(approved.status_code,200,approved.data)
        self.assertEqual(self.slots(),['16:00','18:00'])
        self.assertEqual(m.Citas.objects.count(),1)
        self.assertEqual(self.publish([]).status_code,409)

    def test_other_specialist_has_independent_capacity_at_the_same_time(self):
        self.publish()
        other=m.Profesionales.objects.create(nombres='Otra',apellidos='Especialista',activa=True,visible_reservas=True)
        m.ProfesionalServicios.objects.create(profesional=other,servicio=self.item)
        DailySchedule.objects.create(profesional_id=other.pk,fecha=START.date(),franjas=[{**item,'cupo_unico':True} for item in self.windows])
        self.assertEqual(self.reserve_public(inicio_en=self.start.isoformat()).status_code,201)
        self.assertEqual(self.slots(other.pk),['14:00','16:00','18:00'])
        other_response=self.reserve_public(inicio_en=self.start.isoformat(),profesional_id=other.pk,telefono='+51987654322')
        self.assertEqual(other_response.status_code,201,other_response.data)
        self.assertEqual(PublicBookingRequest.objects.count(),2)

    def test_service_that_does_not_fit_cannot_book_the_slot(self):
        self.publish()
        m.Servicios.objects.filter(pk=self.item.pk).update(duracion_minutos=150)
        self.assertEqual(self.slots(),[])
        self.assertEqual(self.reserve_public(inicio_en=self.start.isoformat()).status_code,409)

    def test_simultaneous_requests_get_only_one_capacity(self):
        self.publish()
        from types import SimpleNamespace
        barrier=Barrier(2)
        def reserve(index):
            connections.close_all()
            try:
                request=SimpleNamespace(session={},META={'REMOTE_ADDR':'127.0.0.1'})
                data=self.payload(inicio_en=self.start,telefono=f'+5198765432{index}')
                barrier.wait(timeout=10)
                try:
                    with agenda_transaction():
                        public_booking.create(request,data)
                    return 201
                except Exception as error:
                    from apps.agenda.domain.errors import AgendaError
                    if isinstance(error,AgendaError) and error.code=='SLOT_NOT_AVAILABLE':return 409
                    raise
            finally:
                connections.close_all()
        with ThreadPoolExecutor(max_workers=2) as pool:
            result=list(pool.map(reserve,[1,2]))
        self.assertEqual(sorted(result),[201,409])
        self.assertEqual(PublicBookingRequest.objects.count(),1)
