from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from types import SimpleNamespace
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.db import connection, connections, IntegrityError, transaction
from django.test import TestCase, override_settings
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.test import APIClient
from negocio.models import Auditoria, Clientas, Visitas
from . import services


PAYLOAD = {'nombres': ' Daniela  María ', 'apellidos': 'Torres', 'telefono': '+51 999 123 456',
           'email': 'daniela@example.com', 'fecha_nacimiento': '2000-03-15',
           'notas_privadas': 'Dato privado ficticio'}


class ClientaTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_superuser('clienta_admin_test', password='Test-only-pass!')

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def create(self, **changes):
        response = self.client.post('/api/clientas/', {**PAYLOAD, **changes}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.json()

    def test_create_defaults_detail_and_list(self):
        data = self.create()
        obj = Clientas.objects.get(pk=data['id'])
        self.assertGreater(obj.pk, 0)
        self.assertEqual(obj.nombres, 'Daniela María')
        self.assertEqual(obj.telefono, '+51999123456')
        self.assertTrue(obj.activa)
        self.assertFalse(obj.consentimiento_datos)
        self.assertIsNone(obj.consentimiento_fecha)
        self.assertFalse(obj.acepta_recordatorios)
        self.assertEqual(obj.canal_preferido, 'EMAIL')
        self.assertIsNotNone(obj.creado_en.tzinfo)
        detail = self.client.get('/api/clientas/' + str(obj.pk) + '/').json()
        self.assertEqual(detail['notas_privadas'], PAYLOAD['notas_privadas'])
        listed = self.client.get('/api/clientas/').json()
        self.assertEqual(listed['count'], 1)
        self.assertNotIn('notas_privadas', listed['results'][0])
        self.assertNotIn('email', listed['results'][0])

    def test_validation(self):
        cases = [('nombres', ''), ('nombres', '   '), ('apellidos', ' '),
                 ('nombres', 'x' * 121), ('telefono', ''), ('telefono', 'abc'),
                 ('telefono', '123'), ('telefono', '+519123'),
                 ('telefono', '+0051999123456'), ('email', 'bad'),
                 ('fecha_nacimiento', (timezone.localdate() + timedelta(days=1)).isoformat())]
        for field, value in cases:
            with self.subTest(field=field, value=value):
                response = self.client.post('/api/clientas/', {**PAYLOAD, field: value}, format='json')
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()['code'], 'validacion')
                self.assertIn(field, response.json()['errors'])

    def test_protected_and_unknown_fields(self):
        for field in ['id', 'activa', 'creado_en', 'actualizado_en', 'consentimiento_datos', 'consentimiento_fecha', 'acepta_recordatorios', 'is_staff']:
            response = self.client.post('/api/clientas/', {**PAYLOAD, field: True}, format='json')
            self.assertEqual(response.status_code, 400)

    def test_duplicate_normalized_phone(self):
        self.create()
        response = self.client.post('/api/clientas/', {**PAYLOAD, 'telefono': '999123456'}, format='json')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['code'], 'telefono_duplicado')
        self.assertEqual(Clientas.objects.count(), 1)

    def test_duplicate_legacy_format(self):
        obj = Clientas.objects.get(pk=self.create()['id'])
        Clientas.objects.filter(pk=obj.pk).update(telefono='999 123 456')
        response = self.client.post('/api/clientas/', PAYLOAD, format='json')
        self.assertEqual(response.status_code, 409)

    def test_international_and_peruvian_landline(self):
        for phone in ['+14155552671', '+5112345678']:
            self.assertEqual(self.create(telefono=phone)['telefono'], phone)

    def test_database_race_integrity_error_is_controlled(self):
        self.create()
        with patch('apps.clientas.services.check_phone'):
            response = self.client.post('/api/clientas/', PAYLOAD, format='json')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(Clientas.objects.count(), 1)

    def test_patch_and_audit_redaction(self):
        data = self.create()
        path = '/api/clientas/' + str(data['id']) + '/'
        response = self.client.patch(path, {'nombres': ' Rosa  María ', 'notas_privadas': 'Otra nota privada'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['nombres'], 'Rosa María')
        obj = Clientas.objects.get(pk=data['id'])
        self.assertEqual(obj.telefono, '+51999123456')
        self.assertEqual(obj.creado_en, parse_datetime(data['creado_en']))
        self.assertGreaterEqual(obj.actualizado_en, obj.creado_en)
        audit = Auditoria.objects.filter(accion='MODIFICAR').get()
        self.assertEqual(audit.datos, {'campos': ['nombres', 'notas_privadas']})
        self.assertNotIn('Otra nota', str(audit.datos))

    def test_duplicate_patch_keeps_original(self):
        first = self.create()
        second = self.create(telefono='+51999123457')
        response = self.client.patch('/api/clientas/' + str(second['id']) + '/', {'telefono': first['telefono']}, format='json')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(Clientas.objects.get(pk=second['id']).telefono, '+51999123457')

    def test_search_accents_spaces_and_phone(self):
        self.create()
        for search in ['daniela', 'MARIA', '  Daniela   Maria ', 'torres', '999123456', "x' OR 1=1 --"]:
            result = self.client.get('/api/clientas/', {'search': search}).json()
            self.assertEqual(result['count'], 0 if 'OR' in search else 1)

    def test_order_pagination_filters(self):
        self.create(apellidos='Zeta')
        self.create(apellidos='Alfa', telefono='+51999123457')
        inactive = self.create(apellidos='Beta', telefono='+51999123458')
        self.client.post('/api/clientas/' + str(inactive['id']) + '/desactivar/')
        response = self.client.get('/api/clientas/', {'page_size': 1}).json()
        self.assertEqual(response['count'], 2)
        self.assertIsNotNone(response['next'])
        self.assertEqual(response['results'][0]['apellidos'], 'Alfa')
        self.assertEqual(self.client.get('/api/clientas/', {'activa': 'all'}).json()['count'], 3)
        self.assertEqual(self.client.get('/api/clientas/', {'activa': 'false'}).json()['count'], 1)
        for params in [{'activa': 'invalid'}, {'page_size': 'bad'}, {'page_size': 0}]:
            self.assertEqual(self.client.get('/api/clientas/', params).status_code, 400)
        self.assertEqual(self.client.get('/api/clientas/', {'page': 99}).status_code, 404)

    def test_page_size_capped_at_100(self):
        from .views import ClientaPagination
        from rest_framework.request import Request
        from rest_framework.test import APIRequestFactory
        request = Request(APIRequestFactory().get('/', {'page_size': 1000}))
        self.assertEqual(ClientaPagination().get_page_size(request), 100)

    def test_soft_delete_preserves_visits_idempotent(self):
        obj = Clientas.objects.get(pk=self.create()['id'])
        visit = Visitas.objects.create(clienta=obj, inicio_en=timezone.now(), estado='ABIERTA', creada_por_id=self.admin.pk)
        path = '/api/clientas/' + str(obj.pk) + '/'
        for _ in range(2):
            self.assertEqual(self.client.post(path + 'desactivar/').status_code, 200)
        self.assertTrue(Visitas.objects.filter(pk=visit.pk).exists())
        self.assertEqual(Auditoria.objects.filter(accion='DESACTIVAR').count(), 1)
        self.assertEqual(self.client.get('/api/clientas/').json()['count'], 0)
        self.assertEqual(self.client.get(path).status_code, 200)
        for _ in range(2):
            self.assertEqual(self.client.post(path + 'reactivar/').status_code, 200)
        self.assertEqual(Auditoria.objects.filter(accion='REACTIVAR').count(), 1)
        self.assertEqual(self.client.delete(path).status_code, 405)
        self.assertTrue(Clientas.objects.filter(pk=obj.pk).exists())

    def test_writes_require_csrf(self):
        obj = self.create()
        browser = APIClient(enforce_csrf_checks=True)
        browser.force_login(self.admin)
        for path, method in [('/api/clientas/', 'post'), ('/api/clientas/' + str(obj['id']) + '/', 'patch'),
                             ('/api/clientas/' + str(obj['id']) + '/desactivar/', 'post'),
                             ('/api/clientas/' + str(obj['id']) + '/reactivar/', 'post'),
                             ('/api/clientas/' + str(obj['id']) + '/consentimiento/', 'post')]:
            self.assertEqual(getattr(browser, method)(path, PAYLOAD, format='json').status_code, 403)

    def test_real_session_create_patch_and_no_public_notes(self):
        browser = APIClient(enforce_csrf_checks=True)
        browser.force_login(self.admin)
        browser.get('/api/auth/csrf/')
        token = browser.cookies['csrftoken'].value
        response = browser.post('/api/clientas/', PAYLOAD, format='json', HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 201)
        path = '/api/clientas/' + str(response.json()['id']) + '/'
        self.assertEqual(browser.patch(path, {'email': ''}, format='json', HTTP_X_CSRFTOKEN=token).status_code, 200)
        anonymous = APIClient()
        response = anonymous.get(path)
        self.assertEqual(response.status_code, 403)
        self.assertNotIn(PAYLOAD['notas_privadas'], response.content.decode())

    @override_settings(PRIVACY_NOTICE_VERSION='', PRIVACY_NOTICE_URL='')
    def test_consent_requires_configured_notice(self):
        obj = self.create()
        response = self.client.post('/api/clientas/' + str(obj['id']) + '/consentimiento/',
            {'otorgado': True, 'evidencia': 'ref-ficticia', 'version_aviso': 'v1'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Clientas.objects.get(pk=obj['id']).consentimiento_datos)

    @override_settings(PRIVACY_NOTICE_VERSION='v1', PRIVACY_NOTICE_URL='https://example.com/privacidad')
    def test_explicit_consent_and_revocation(self):
        obj = self.create()
        path = '/api/clientas/' + str(obj['id']) + '/consentimiento/'
        for payload in [{'otorgado': True}, {'otorgado': True, 'evidencia': 'ref', 'version_aviso': 'old'}]:
            self.assertEqual(self.client.post(path, payload, format='json').status_code, 400)
        before = timezone.now()
        response = self.client.post(path, {'otorgado': True, 'evidencia': 'ref-ficticia', 'version_aviso': 'v1'}, format='json')
        self.assertEqual(response.status_code, 200)
        saved = Clientas.objects.get(pk=obj['id'])
        self.assertTrue(saved.consentimiento_datos)
        self.assertGreaterEqual(saved.consentimiento_fecha, before)
        self.assertEqual(Auditoria.objects.filter(accion='CONSENTIMIENTO').get().datos['evidencia'], 'ref-ficticia')
        response = self.client.post(path, {'otorgado': False, 'evidencia': 'ref-revocacion', 'version_aviso': 'v1'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(Clientas.objects.get(pk=obj['id']).consentimiento_fecha)

    def test_database_consent_check(self):
        obj = self.create()
        with self.assertRaises(IntegrityError), transaction.atomic():
            Clientas.objects.filter(pk=obj['id']).update(consentimiento_datos=True, consentimiento_fecha=None)

    def test_legacy_database_defaults(self):
        obj = Clientas.objects.create(nombres='Ficticia', apellidos='Defaults', telefono='+51988222333')
        obj.refresh_from_db()
        self.assertTrue(obj.activa)
        self.assertFalse(obj.consentimiento_datos)
        self.assertIsNone(obj.consentimiento_fecha)
        self.assertTrue(obj.acepta_recordatorios)
        self.assertEqual(obj.canal_preferido, 'WHATSAPP')
        self.assertIsNotNone(obj.creado_en)

    def test_trigger_uses_database_transaction_timestamp(self):
        obj = self.create()
        path = '/api/clientas/' + str(obj['id']) + '/'
        with connection.cursor() as cursor:
            cursor.execute('SELECT now()')
            db_now = cursor.fetchone()[0]
        self.assertEqual(self.client.patch(path, {'apellidos': 'Cambio'}, format='json').status_code, 200)
        self.assertEqual(Clientas.objects.get(pk=obj['id']).actualizado_en, db_now)

    def test_audit_failure_rolls_back_clienta(self):
        with patch('apps.clientas.services.audit', side_effect=RuntimeError('audit unavailable')):
            with self.assertRaises(RuntimeError):
                services.save_clienta({'nombres': 'Ficticia', 'apellidos': 'Prueba', 'telefono': '+51988111111'}, self.admin)
        self.assertFalse(Clientas.objects.filter(telefono='+51988111111').exists())

    def test_concurrent_duplicate_insert(self):
        barrier = Barrier(2)
        phone = '+51988776655'
        def worker():
            try:
                barrier.wait(timeout=10)
                services.save_clienta({'nombres': 'Concurrente', 'apellidos': 'Ficticia', 'telefono': phone}, SimpleNamespace(pk=None))
                return 201
            except services.PhoneConflict:
                return 409
            finally:
                connections['default'].close()
        try:
            with ThreadPoolExecutor(max_workers=2) as executor:
                statuses = list(executor.map(lambda _: worker(), range(2)))
            self.assertEqual(sorted(statuses), [201, 409])
        finally:
            # Workers committed in their isolated connections; remove only their fictional rows.
            def cleanup():
                try:
                    with transaction.atomic(), connections['default'].cursor() as cursor:
                        cursor.execute('DELETE FROM auditoria WHERE entidad=%s AND entidad_id IN (SELECT id::text FROM clientas WHERE telefono=%s)', ['clientas', phone])
                        cursor.execute('DELETE FROM clientas WHERE telefono=%s', [phone])
                finally:
                    connections['default'].close()
            with ThreadPoolExecutor(max_workers=1) as executor:
                executor.submit(cleanup).result(timeout=10)

