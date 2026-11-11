from unittest.mock import patch
from rest_framework.test import APIClient
from apps.finanzas.domain.errors import FinanceError
from .base import API,FinanceTestCase


class PermissionTests(FinanceTestCase):
    def routes(self):
        routes=[]
        for resource in ['visitas','ventas','pagos','anticipos']:
            routes += [('get',resource+'/'),('get',resource+'/1/')]
        routes += [('post','visitas/'),('patch','visitas/1/'),('post','ventas/'),('patch','ventas/1/'),('post','anticipos/')]
        for resource,actions in [('visitas',['cancelar','finalizar']),('ventas',['previsualizar','confirmar','anular','pagar','aplicar-anticipo']),
                                 ('pagos',['anular']),('anticipos',['confirmar','anular'])]:
            routes += [('post',resource+'/1/'+action+'/') for action in actions]
        return routes+[('get','ventas/1/anticipos-aplicables/'),('get','ventas/profesionales/')]

    def test_anonymous_nonstaff_and_staff_without_finance_permissions_rejected(self):
        for user in [None,self.regular,self.staff]:
            client=APIClient()
            if user:client.force_authenticate(user)
            for method,path in self.routes():
                with self.subTest(user=user,path=path):
                    self.assertEqual(getattr(client,method)(API+path,{},format='json').status_code,403)

    def test_all_authenticated_writes_require_csrf(self):
        client=APIClient(enforce_csrf_checks=True)
        client.force_login(self.admin)
        for method,path in self.routes():
            if method!='get':
                self.assertEqual(getattr(client,method)(API+path,{},format='json').status_code,403)
        client.get('/api/auth/csrf/')
        response=client.post(API+'visitas/',{'clienta_id':self.person.pk},format='json',
                            HTTP_X_CSRFTOKEN=client.cookies['csrftoken'].value,HTTP_IDEMPOTENCY_KEY='550e8400-e29b-41d4-a716-446655440000')
        self.assertEqual(response.status_code,201)

    def test_missing_key_schema_guard_and_no_pii_in_persistent_response(self):
        response=self.client.post(API+'visitas/',{'clienta_id':self.person.pk},format='json')
        self.assertEqual(response.status_code,400)
        with patch('apps.finanzas.presentation.views.ensure_ready',side_effect=FinanceError('fase5_migracion_pendiente','Pendiente','unavailable')):
            self.assertEqual(self.client.get(API+'ventas/').status_code,503)
        self.visit(notas='Dato privado ficticio')
        from apps.finanzas.models import IdempotencyRecord
        stored=str(list(IdempotencyRecord.objects.values_list('response_body',flat=True)))
        self.assertNotIn('Daniela',stored)
        self.assertNotIn('51999123456',stored)
        self.assertNotIn('Dato privado',stored)

    def test_cashier_cannot_void_payment_without_specific_permission(self):
        self.client.force_authenticate(self.cashier)
        response=self.mutate('pagos/1/anular/',{'motivo':'Error administrativo','error_registro_confirmado':True})
        self.assertEqual(response.status_code,403)

