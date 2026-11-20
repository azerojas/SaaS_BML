import uuid
from django.contrib.auth.models import Permission
from rest_framework.test import APIClient
from .base import AgendaTestCase, API
from .base import START
from negocio import models as m


class FrontendSecurityTests(AgendaTestCase):
    def test_resolve_racing_a_mutation_never_reports_closed_after_commit(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        from django.db import connections
        barrier = Barrier(2, timeout=15)
        key = str(uuid.uuid4())
        hours = {'profesional_id': self.prof, 'dia_semana': 4,
                 'hora_inicio': '09:00', 'hora_fin': '13:00'}
        before = m.HorariosProfesional.objects.count()

        def send(close):
            try:
                client = APIClient()
                client.force_authenticate(self.admin)
                barrier.wait()
                if close:
                    return client.post(API + 'intentos/' + key + '/resolver/',
                                       {'operacion': 'agenda.horario.crear'}, format='json')
                return client.post(API + 'horarios/', hours, format='json', HTTP_IDEMPOTENCY_KEY=key)
            finally:
                connections['default'].close()

        with ThreadPoolExecutor(max_workers=2) as pool:
            mutation, resolution = list(pool.map(send, (False, True)))
        self.assertEqual(resolution.status_code, 200, resolution.data)
        if resolution.json()['cerrado']:
            self.assertEqual(mutation.status_code, 409, mutation.data)
            self.assertEqual(m.HorariosProfesional.objects.count(), before)
        else:
            self.assertEqual(mutation.status_code, 201, mutation.data)
            self.assertEqual(resolution.json()['resultado'], mutation.json())
            self.assertEqual(m.HorariosProfesional.objects.count(), before + 1)

    def test_resolve_unused_key_blocks_delayed_mutation_and_allows_new_key(self):
        from apps.finanzas.models import IdempotencyRecord
        key = str(uuid.uuid4())
        url = API + 'intentos/' + key + '/'
        payload = {'operacion': 'agenda.horario.crear'}
        hours = {'profesional_id': self.prof, 'dia_semana': 3,
                 'hora_inicio': '09:00', 'hora_fin': '13:00'}
        before = m.HorariosProfesional.objects.count()
        for _ in range(2):
            response = self.client.post(url + 'resolver/', payload, format='json')
            self.assertEqual(response.status_code, 200, response.data)
            self.assertTrue(response.json()['cerrado'])
            self.assertFalse(response.json()['encontrado'])
        self.assertEqual(IdempotencyRecord.objects.filter(key=key).count(), 1)
        self.assertTrue(self.client.get(url, payload).json()['cerrado'])
        delayed = self.call('horarios/', hours, key=key, status=409)
        self.assertEqual(delayed.json()['code'], 'idempotencia_conflicto')
        self.assertEqual(m.HorariosProfesional.objects.count(), before)
        self.call('horarios/', hours, status=201)
        self.assertEqual(m.HorariosProfesional.objects.count(), before + 1)

    def test_resolve_recovers_committed_result_without_cancelling_booking(self):
        key = str(uuid.uuid4())
        original = self.call('citas/', self.booking(), key=key, status=201)
        response = self.client.post(API + 'intentos/' + key + '/resolver/',
                                    {'operacion': 'agenda.cita.crear'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['cerrado'])
        self.assertEqual(response.json()['resultado'], original.json())
        replay = self.call('citas/', self.booking(), key=key, status=201)
        self.assertEqual(replay.json(), original.json())
        self.assertEqual(m.Citas.objects.count(), 1)

    def test_resolve_enforces_permissions_and_actor_scope(self):
        from apps.finanzas.models import IdempotencyRecord
        key = str(uuid.uuid4())
        url = API + 'intentos/' + key + '/resolver/'
        self.reader()
        payload = {'operacion': 'agenda.horario.crear'}
        self.assertEqual(self.client.post(url, payload, format='json').status_code, 403)
        self.assertFalse(IdempotencyRecord.objects.filter(key=key).exists())
        self.reader('manage_schedules')
        self.assertEqual(self.client.post(url, {'operacion': []}, format='json').status_code, 400)
        self.assertEqual(self.client.post(url, {**payload, 'extra': True}, format='json').status_code, 400)
        self.assertEqual(self.client.post(url, payload, format='json').status_code, 200)
        self.assertFalse(IdempotencyRecord.objects.filter(key=key, actor=self.admin).exists())

    def reader(self, *permissions):
        self.staff.user_permissions.add(*Permission.objects.filter(content_type__app_label='agenda', codename__in=['view_agenda', *permissions]))
        self.client.force_authenticate(type(self.staff).objects.get(pk=self.staff.pk))

    def test_professional_sensitive_fields_require_explicit_admin_permission(self):
        self.reader()
        for path in ('profesionales/', 'profesionales/' + str(self.prof) + '/'):
            response = self.client.get(API + path)
            self.assertEqual(response.status_code, 200)
            rows = response.json()['results'] if 'results' in response.json() else [response.json()]
            for row in rows:
                self.assertEqual(set(row), {'id', 'nombres', 'apellidos', 'activa', 'servicios', 'publicacion_propia'})
                self.assertFalse(row['publicacion_propia'])
                self.assertEqual(row['servicios'], [self.item.pk])
        self.reader('manage_professionals')
        row = self.client.get(API + 'profesionales/' + str(self.prof) + '/').json()
        self.assertIn('comision_porcentaje', row)
        self.assertNotIn('usuario_id', row)

    def test_agenda_result_recovery_is_actor_scoped_and_does_not_return_notes(self):
        key = str(uuid.uuid4())
        original = self.call('citas/', self.booking(notas='PRIVATE_PHASE7_NOTE'), key=key, status=201)
        url = API + 'intentos/' + key + '/'
        result = self.client.get(url, {'operacion': 'agenda.cita.crear'})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['resultado'], original.json())
        self.assertNotIn('PRIVATE_PHASE7_NOTE', result.content.decode())
        self.reader('manage_appointments')
        self.assertFalse(self.client.get(url, {'operacion': 'agenda.cita.crear'}).json()['encontrado'])

    def test_recovery_enforces_action_read_permissions_uuid_and_methods(self):
        url = API + 'intentos/' + str(uuid.uuid4()) + '/'
        self.reader()
        self.assertEqual(self.client.get(url, {'operacion': 'agenda.cita.crear'}).status_code, 403)
        self.assertEqual(self.client.get(url, {'operacion': 'invalid'}).status_code, 400)
        self.assertEqual(self.client.get(url, {'operacion': 'anticipo.crear'}).status_code, 403)
        self.assertEqual(self.client.get(url, {'operacion': 'agenda.cita.crear', 'extra': 'x'}).status_code, 400)
        self.assertEqual(self.client.post(url, {}, format='json').status_code, 405)
        public = APIClient()
        self.assertEqual(public.get(url, {'operacion': 'agenda.cita.crear'}).status_code, 403)
        self.reader('manage_appointments')
        self.assertEqual(self.client.get(API + 'intentos/' + str(uuid.UUID(int=0)) + '/', {'operacion': 'agenda.cita.crear'}).status_code, 400)

    def test_calendar_filters_by_service_without_detail_fanout(self):
        self.reserve()
        response=self.client.get(API+'citas/', {'servicio_id': self.item.pk})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['count'],1)
        self.assertEqual(self.client.get(API+'citas/', {'servicio_id': self.item.pk+1000}).json()['count'],0)

    def test_reschedule_availability_uses_snapshot_and_excludes_own_booking(self):
        appointment=self.reserve()
        m.Servicios.objects.filter(pk=self.item.pk).update(duracion_minutos=120,precio_base='999.00')
        response=self.client.get(API+'calendario/disponibilidad/',{'fecha':START.date().isoformat(),'profesional_id':self.prof,'servicios':str(self.item.pk),'cita_id':appointment})
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.json()['duracion_minutos'],60)
        self.assertEqual(response.json()['precio_total'],'80.00')
        self.assertIn(START.isoformat(),[row['inicio_en'] for row in response.json()['slots']])
        self.reader()
        self.assertEqual(self.client.get(API+'calendario/disponibilidad/',{'fecha':START.date().isoformat(),'profesional_id':self.prof,'servicios':str(self.item.pk),'cita_id':appointment}).status_code,403)

    def test_professional_list_has_bounded_queries_with_many_professionals(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        m.Profesionales.objects.bulk_create([m.Profesionales(nombres='Synthetic '+str(index),apellidos='Scale') for index in range(50)])
        with CaptureQueriesContext(connection) as captured:
            response=self.client.get(API+'profesionales/',{'page_size':100})
            self.assertEqual(response.status_code,200)
            self.assertEqual(len(response.json()['results']),51)
        self.assertLessEqual(len(captured),6,'Professional specialties must not cause N+1 queries.')
