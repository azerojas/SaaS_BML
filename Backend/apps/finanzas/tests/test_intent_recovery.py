import uuid
from django.contrib.auth.models import Permission
from apps.finanzas.models import IdempotencyRecord
from .base import FinanceTestCase


class IntentRecoveryTests(FinanceTestCase):
    def lookup(self, key, operation='visita.abrir'):
        return self.client.get('/api/finanzas/intentos/' + key + '/', {'operacion': operation})

    def test_committed_response_is_recovered_without_payload_or_pii(self):
        key = str(uuid.uuid4())
        response = self.mutate('visitas/', {'clienta_id': self.person.pk, 'notas': 'PRIVATE-NOTES-SENTINEL'}, key, expected=201)
        result = self.lookup(key)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['resultado'], response.json())
        self.assertEqual(result.json()['estado_http'], 201)
        self.assertTrue(result.json()['encontrado'])
        self.assertNotIn('PRIVATE-NOTES-SENTINEL', result.content.decode())
        self.assertNotIn('request_hash', result.json())
        self.assertEqual(IdempotencyRecord.objects.count(), 1)

    def test_records_are_actor_and_operation_scoped(self):
        key = str(uuid.uuid4())
        self.mutate('visitas/', {'clienta_id': self.person.pk}, key, expected=201)
        self.assertFalse(self.lookup(key, 'venta.crear').json()['encontrado'])
        self.client.force_authenticate(self.cashier)
        self.assertFalse(self.lookup(key).json()['encontrado'])

    def test_requires_read_and_operation_permissions(self):
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.lookup(str(uuid.uuid4())).status_code, 403)
        self.staff.user_permissions.add(Permission.objects.get(content_type__app_label='finanzas', codename='view_finance'))
        self.client.force_authenticate(type(self.staff).objects.get(pk=self.staff.pk))
        self.assertEqual(self.lookup(str(uuid.uuid4())).status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.lookup(str(uuid.uuid4())).status_code, 403)

    def test_unknown_uuid_invalid_operation_and_write_are_rejected_or_not_found(self):
        self.assertFalse(self.lookup(str(uuid.uuid4())).json()['encontrado'])
        self.assertEqual(self.lookup(str(uuid.UUID(int=0))).status_code, 400)
        self.assertEqual(self.lookup(str(uuid.uuid4()), 'arbitrary').status_code, 400)
        self.assertEqual(self.client.post('/api/finanzas/intentos/' + str(uuid.uuid4()) + '/', {}, format='json').status_code, 405)

    def test_payment_recovery_does_not_create_a_second_payment(self):
        sale = self.sale([self.product_line(self.product())])
        self.assertEqual(self.confirm(sale).status_code, 200)
        key = str(uuid.uuid4())
        first = self.pay(sale, '10.00', key=key)
        self.assertEqual(first.status_code, 201)
        recovered = self.lookup(key, 'pago.registrar')
        self.assertEqual(recovered.json()['resultado'], first.json())
        self.assertEqual(self.pay(sale, '10.00', key=key).json(), first.json())
        self.assertEqual(self.detail(sale)['saldo']['pagos_confirmados'], '10.00')
