import json
import logging
from io import StringIO,BytesIO
from datetime import timedelta
from unittest.mock import patch
from cryptography.fernet import Fernet
from django.contrib.auth.models import Permission
from django.test import TestCase,override_settings
from django.test.utils import CaptureQueriesContext
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient
from apps.finanzas.tests.base import FinanceTestCase
from apps.operaciones.models import MFADevice,JobState
from apps.operaciones.infrastructure.logging import SafeJSONFormatter
from apps.operaciones.presentation.parsers import BoundedJSONParser
from rest_framework.exceptions import ParseError


class SecurityTests(FinanceTestCase):
    def test_staff_marker_or_unrelated_permission_never_grants_legacy_resources(self):
        self.client.force_authenticate(self.staff)
        self.staff.user_permissions.add(Permission.objects.get(content_type__app_label='negocio',codename='view_servicios'))
        for path in ['/api/clientas/','/api/clientas/'+str(self.person.pk)+'/',
                     '/api/compras/','/api/proveedores/','/api/admin/checkin/llegadas/']:
            self.assertEqual(self.client.get(path).status_code,403,path)
        self.assertEqual(self.client.get('/api/admin/catalogo/servicios/').status_code,200)
        self.assertEqual(self.client.post('/api/admin/catalogo/servicios/',{'nombre':'No permitido','precio_base':'2.00'},format='json').status_code,403)

    def test_model_read_and_write_grants_are_distinct(self):
        self.staff.user_permissions.add(Permission.objects.get(content_type__app_label='negocio',codename='view_clientas'))
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get('/api/clientas/').status_code,200)
        self.assertEqual(self.client.patch('/api/clientas/'+str(self.person.pk)+'/',{'nombres':'No permitido'},format='json').status_code,403)

    def test_live_is_database_independent_and_ready_handles_db_failure(self):
        with CaptureQueriesContext(connection) as queries:
            response=self.client.get('/health/live')
        self.assertEqual(response.status_code,200)
        self.assertEqual(len(queries),0)
        with patch('apps.operaciones.presentation.views.readiness',return_value=False):
            response=self.client.get('/health/ready')
            self.assertEqual(response.status_code,503)
            self.assertEqual(response.json(),{'status':'not_ready'})

    def test_request_size_headers_correlation_and_streaming_parser(self):
        response=self.client.post('/api/clientas/',b'x'*65537,content_type='application/json')
        self.assertEqual(response.status_code,413)
        self.assertEqual(len(response['X-Request-ID']),32)
        self.assertEqual(response['Referrer-Policy'],'no-referrer')
        self.assertIn("frame-ancestors 'none'",response['Content-Security-Policy'])
        with self.assertRaises(ParseError):BoundedJSONParser().parse(BytesIO(b'x'*65537))
        with self.assertRaises(ParseError):BoundedJSONParser().parse(BytesIO(b'['*3000))

    def test_log_formatter_never_serializes_raw_message_body_tokens_or_trace(self):
        record=logging.LogRecord('django.request',logging.ERROR,'source.py',1,'password=123 private phone +51999999999',(),None)
        record.request_id='a'*32
        record.route='api/public/checkin/<uuid:token>/'
        record.body='secret'
        record.headers={'Authorization':'Bearer secret'}
        result=SafeJSONFormatter().format(record)
        for secret in ['123','51999999999','Bearer','password','secret']:self.assertNotIn(secret,result)
        self.assertEqual(json.loads(result)['request_id'],'a'*32)

    @override_settings(APP_ENV='production',DEBUG=False)
    def test_production_exception_response_has_no_exception_or_payload(self):
        from config.errors import api_exception_handler
        response=api_exception_handler(RuntimeError('database secret and private note'),{'request':None})
        self.assertEqual(response.status_code,500)
        self.assertEqual(response.data,{'code':'internal_error','detail':'No se pudo completar la solicitud.'})

    def test_private_operations_requires_its_specific_permission(self):
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get('/api/v1/operations/status/').status_code,403)

    def test_all_health_methods_are_read_only(self):
        for path in ['/health/live','/health/ready']:
            self.assertEqual(self.client.post(path,{},format='json').status_code,405)
