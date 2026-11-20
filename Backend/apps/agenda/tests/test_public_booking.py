import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timedelta
from types import SimpleNamespace
from django.db import connection, connections
from django.test import override_settings
from rest_framework.test import APIClient
from apps.agenda.tests.base import AgendaTestCase, START, NOW
from apps.agenda.models import PublicBookingRequest, PublicBookingIntent
from apps.agenda.application import public_booking
from apps.agenda.presentation.public_serializers import PublicBookingInput
from apps.agenda.domain.errors import AgendaError
from negocio import models as m

ROOT = '/api/v1/public/reservas/'


@override_settings(AGENDA_PUBLIC_WRITE_ENABLED=True, AGENDA_REQUIRE_DEPOSITS=False, AGENDA_REQUEST_HOLD_MINUTES=30,
    PRIVACY_NOTICE_URL='https://example.test/privacidad', PRIVACY_NOTICE_VERSION='test-v1')
class PublicBookingTests(AgendaTestCase):
    def setUp(self):
        super().setUp()
        self.item.visible_catalogo, self.item.requiere_anticipo = True, True
        self.item.save(update_fields=['visible_catalogo','requiere_anticipo'])
        self.public = self.browser()

    def browser(self):
        client = APIClient(enforce_csrf_checks=True)
        client.get('/api/auth/csrf/')
        response = client.get(ROOT + 'configuracion/')
        self.assertEqual(response.status_code,200,response.data)
        return client

    def _fixture_teardown(self):
        assert connection.settings_dict['NAME'].startswith('test_lasheo_phase1_')
        with connection.cursor() as cursor:
            cursor.execute('TRUNCATE agenda_publicbookingrequest, agenda_publicbookingintent RESTART IDENTITY')
        super()._fixture_teardown()

    def post(self,path,data,key=None,client=None):
        client=client or self.public
        return client.post(ROOT+path,data,format='json',HTTP_X_CSRFTOKEN=client.cookies['csrftoken'].value,
            **({'HTTP_IDEMPOTENCY_KEY':key} if key else {}))

    def payload(self,**changes):
        return {'nombres':'Nueva','apellidos':'Clienta','telefono':'+51987654321',
            'profesional_id':self.prof,'servicios':[self.item.pk],'inicio_en':START.isoformat(),
            'consentimiento_datos':True,'version_aviso':'test-v1',**changes}

    def reserve_public(self,key=None,**changes):
        return self.post('solicitudes/',self.payload(**changes),key or str(uuid.uuid4()))

    def approve(self,pk,key=None,**changes):
        return self.call(f'solicitudes/{pk}/aprobar/',{'identidad_verificada':True,'consentimiento_verificado':True,**changes},key=key)

    def test_csrf_required_for_anonymous_requests(self):
        response=self.public.post(ROOT+'solicitudes/',self.payload(),format='json')
        self.assertEqual(response.status_code,403)
        self.assertFalse(PublicBookingRequest.objects.exists())

    def test_request_does_not_create_client_or_confirm_appointment_and_issues_code(self):
        before=m.Clientas.objects.count()
        response=self.reserve_public()
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(response.data['estado'],'PENDIENTE')
        self.assertRegex(response.data['management_code'],r'^\d{8}$')
        self.assertNotIn('management_token',response.data)
        self.assertFalse(m.Citas.objects.exists())
        self.assertEqual(m.Clientas.objects.count(),before)
        listed=self.public.get(ROOT+'solicitudes/').json()['results'][0]
        self.assertEqual(listed['nombres'],'Nueva')
        self.assertEqual(listed['apellidos'],'Clienta')
        for field in ['telefono','management_code','management_token']:
            self.assertNotIn(field,listed)
        self.assertEqual(self.public.get('/api/clientas/').status_code,403)

    def test_phone_and_code_only_unlock_the_matching_request(self):
        first=self.reserve_public().json()
        second=self.browser()
        self.assertEqual(second.get(ROOT+f'solicitudes/{first["id"]}/').status_code,403)
        self.assertEqual(self.post('acceso/',{'token':str(uuid.uuid4())},client=second).status_code,404)
        wrong_code = '00000000' if first['management_code'] != '00000000' else '00000001'
        denied=self.post('acceso/',{'telefono':'+51987654321','codigo':wrong_code},client=second)
        self.assertEqual(denied.status_code,404)
        self.assertEqual(denied.data['code'],'BOOKING_ACCESS_DENIED')
        accepted=self.post('acceso/',{
            'telefono':'+51987654321',
            'codigo':first['management_code'],
        },client=second)
        self.assertEqual(accepted.status_code,200,accepted.data)
        self.assertEqual(accepted.data['nombres'],'Nueva')
        self.assertEqual(second.get(ROOT+f'solicitudes/{first["id"]}/').status_code,200)
        self.assertEqual(self.post('acceso/',{'telefono':'+51987654321'},client=second).status_code,400)
        self.post('salir/',{},client=second)
        self.assertEqual(second.get(ROOT+f'solicitudes/{first["id"]}/').status_code,403)

    def test_unknown_phone_and_wrong_code_are_indistinguishable_and_limited(self):
        unknown=self.post('acceso/',{'telefono':'+51987654320','codigo':'12345678'})
        wrong=self.post('acceso/',{'telefono':'+51987654321','codigo':'12345678'})
        self.assertEqual(unknown.status_code,404)
        self.assertEqual(wrong.status_code,404)
        self.assertEqual(unknown.data['detail'],wrong.data['detail'])
        for _ in range(4):
            self.assertEqual(self.post('acceso/',{
                'telefono':'+51987654321',
                'codigo':'12345678',
            }).status_code,404)
        limited=self.post('acceso/',{'telefono':'+51987654321','codigo':'12345678'})
        self.assertEqual(limited.status_code,429)

    def test_same_key_recovers_the_code_without_storing_it_in_plaintext(self):
        key=str(uuid.uuid4())
        first=self.reserve_public(key).json()
        second=self.reserve_public(key)
        self.assertEqual(second.json(),first)
        self.assertEqual(PublicBookingRequest.objects.count(),1)
        self.assertEqual(self.reserve_public(key,nombres='Diferente').status_code,409)
        intent=PublicBookingIntent.objects.get(key=key)
        self.assertNotIn('management_code',intent.result)
        self.assertTrue(intent.result['_issue_management_code'])
        self.assertEqual(self.public.get(ROOT+f'intentos/{key}/').json()['result'],first)
        other=self.browser()
        self.assertFalse(other.get(ROOT+f'intentos/{key}/').json()['found'])

    def test_pending_hold_blocks_private_and_public_booking(self):
        first=self.reserve_public()
        self.assertEqual(first.status_code,201,first.data)
        self.assertEqual(self.call('citas/',self.booking()).status_code,409)
        self.assertEqual(self.reserve_public(telefono='+51987654322').status_code,409)
        slots=self.get_slots(public=True)
        self.assertNotIn(START.isoformat(),[slot['inicio_en'] for slot in slots['slots']])

    def test_pending_cancel_releases_hold_and_never_creates_client(self):
        first=self.reserve_public().json()
        result=self.post(f'solicitudes/{first["id"]}/cancelar/',{'motivo':'Cambio de planes'},str(uuid.uuid4()))
        self.assertEqual(result.status_code,200,result.data)
        self.assertEqual(result.data['estado'],'CANCELADA')
        self.assertEqual(self.call('citas/',self.booking()).status_code,201)

    def test_expired_hold_is_ignored_without_relying_on_job(self):
        first=self.reserve_public().json()
        PublicBookingRequest.objects.filter(pk=first['id']).update(expira_en=NOW)
        self.assertEqual(self.public.get(ROOT+f'solicitudes/{first["id"]}/').data['estado'],'EXPIRADA')
        self.assertEqual(self.approve(first['id']).status_code,409)
        self.assertEqual(self.call('citas/',self.booking()).status_code,201)

    def test_staff_approval_requires_explicit_checks_and_is_idempotent(self):
        first=self.reserve_public().json()
        self.assertEqual(self.approve(first['id'],identidad_verificada=False).status_code,400)
        key=str(uuid.uuid4())
        result=self.approve(first['id'],key)
        self.assertEqual(result.status_code,200,result.data)
        self.assertEqual(result.data['estado'],'PROGRAMADA')
        self.assertEqual(result.data['anticipo_requerido'],'0.00')
        self.assertEqual(self.approve(first['id'],key).json(),result.json())
        self.assertEqual(m.Citas.objects.count(),1)
        self.assertEqual(self.approve(first['id']).status_code,409)
        obj=m.Citas.objects.get()
        self.assertEqual(obj.origen,'ONLINE')
        self.assertIsNone(obj.expira_en)
        self.assertEqual(obj.creada_por_id,self.admin.pk)
        self.assertEqual(self.public.get(ROOT+f'solicitudes/{first["id"]}/').data['estado'],'PROGRAMADA')

    def test_staff_cannot_approve_without_permission(self):
        first=self.reserve_public().json()
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.approve(first['id']).status_code,403)
        self.assertFalse(m.Citas.objects.exists())

    def test_approval_preserves_quote_when_catalogue_changes(self):
        first=self.reserve_public().json()
        self.item.precio_base='199.00'
        self.item.duracion_minutos=90
        self.item.save(update_fields=['precio_base','duracion_minutos'])
        result=self.approve(first['id'])
        self.assertEqual(result.status_code,200,result.data)
        self.assertEqual(result.data['precio_total'],first['precio_total'])
        obj=m.Citas.objects.get()
        self.assertEqual(obj.duracion_total_minutos,60)
        self.assertEqual(str(obj.citaservicios_set.get().precio_snapshot),first['precio_total'])

    def test_staff_rejection_releases_slot_and_public_sees_reason(self):
        first=self.reserve_public().json()
        result=self.call(f'solicitudes/{first["id"]}/rechazar/',{'motivo':'No podemos atender este horario'})
        self.assertEqual(result.status_code,200,result.data)
        self.assertEqual(self.public.get(ROOT+f'solicitudes/{first["id"]}/').data['estado'],'RECHAZADA')
        self.assertEqual(self.call('citas/',self.booking()).status_code,201)

    def test_reschedule_excludes_own_hold_and_preserves_deadline(self):
        first=self.reserve_public().json()
        slots=self.public.get(ROOT+f'solicitudes/{first["id"]}/disponibilidad/',{'fecha':START.date().isoformat()})
        self.assertEqual(slots.status_code,200,slots.data)
        self.assertIn(START.isoformat(),[slot['inicio_en'] for slot in slots.data['slots']])
        result=self.post(f'solicitudes/{first["id"]}/reprogramar/',{'inicio_en':(START+timedelta(hours=1)).isoformat()},str(uuid.uuid4()))
        self.assertEqual(result.status_code,200,result.data)
        self.assertEqual(datetime.fromisoformat(result.data['expira_en']),datetime.fromisoformat(first['expira_en']))
        self.assertEqual(result.data['precio_total'],first['precio_total'])
        self.assertEqual(result.data['estado'],'PENDIENTE')

    def test_confirmed_changes_obey_cancellation_deadline(self):
        first=self.reserve_public().json()
        self.assertEqual(self.approve(first['id']).status_code,200)
        m.ConfiguracionReservas.objects.filter(pk=1).update(horas_limite_cancelacion=48)
        self.assertEqual(self.post(f'solicitudes/{first["id"]}/cancelar/',{'motivo':'Cambio de planes'},str(uuid.uuid4())).status_code,409)

    def test_consent_and_visibility_rejected_without_partial_request(self):
        self.assertEqual(self.reserve_public(consentimiento_datos=False).status_code,400)
        self.assertEqual(self.reserve_public(version_aviso='old').status_code,400)
        self.item.visible_catalogo=False
        self.item.save(update_fields=['visible_catalogo'])
        self.assertEqual(self.reserve_public().status_code,404)
        self.assertFalse(PublicBookingRequest.objects.exists())

    def test_two_parallel_requests_only_one_wins_slot(self):
        def reserve(index):
            try:
                serializer=PublicBookingInput(data=self.payload(telefono=f'+5198765432{index}'))
                serializer.is_valid(raise_exception=True)
                request=SimpleNamespace(session={'booking_browser':str(uuid.uuid4())})
                try:
                    public_booking.mutate(request,str(uuid.uuid4()),'crear',serializer.validated_data,lambda:public_booking.create(request,serializer.validated_data))
                    return 'created'
                except AgendaError as exc:return exc.code
            finally:connections['default'].close()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(reserve,[1,2]))
        self.assertCountEqual(results,['created','SLOT_NOT_AVAILABLE'])
        self.assertEqual(PublicBookingRequest.objects.count(),1)

