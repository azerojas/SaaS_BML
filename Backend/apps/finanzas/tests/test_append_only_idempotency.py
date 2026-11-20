"""Exercise real SQL permissions rather than a superuser-only mutation path."""
import uuid
from django.db import connection, transaction, DatabaseError
from apps.finanzas.models import IdempotencyRecord
from .base import FinanceTestCase


class AppendOnlyIdempotencyTests(FinanceTestCase):
    def test_professional_and_hours_save_and_replay_without_ledger_update_privilege(self):
        with connection.cursor() as cursor:
            cursor.execute('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')
            if cursor.fetchone()[0]:
                self.skipTest('Run this permission test with a non-superuser test database owner.')
            # TestCase rolls back these ACL changes with its outer transaction.
            cursor.execute('REVOKE UPDATE, DELETE ON idempotency_records FROM CURRENT_USER')
            cursor.execute("SELECT has_table_privilege(current_user,'idempotency_records','UPDATE')")
            self.assertFalse(cursor.fetchone()[0])

        key = str(uuid.uuid4())
        payload = {'nombres': 'Profesional', 'apellidos': 'Prueba aislada',
                   'telefono': None, 'usuario_id': None, 'comision_porcentaje': '0.00',
                   'activa': True, 'visible_reservas': False}
        original = self.mutate('v1/agenda/profesionales/', payload, key=key, expected=201)
        repeated = self.mutate('v1/agenda/profesionales/', payload, key=key, expected=201)
        self.assertEqual(original.json(), repeated.json())
        professional = original.json()['profesional_id']
        hours = {'profesional_id': professional, 'dia_semana': 1,
                 'hora_inicio': '09:00', 'hora_fin': '13:00'}
        hour_key = str(uuid.uuid4())
        saved = self.mutate('v1/agenda/horarios/', hours, key=hour_key, expected=201)
        replay = self.mutate('v1/agenda/horarios/', hours, key=hour_key, expected=201)
        self.assertEqual(saved.json(), replay.json())
        self.assertEqual(IdempotencyRecord.objects.filter(key=key).count(), 1)
        self.assertEqual(IdempotencyRecord.objects.filter(key=hour_key).count(), 1)
        self.mutate('v1/agenda/profesionales/', {**payload, 'nombres': 'Distinta'}, key=key, expected=409)
        # The fix must preserve the database's immutable-record protection.
        with self.assertRaises(DatabaseError), transaction.atomic():
            IdempotencyRecord.objects.filter(key=key).update(response_status=202)
        with self.assertRaises(DatabaseError), transaction.atomic():
            IdempotencyRecord.objects.filter(key=key).delete()
