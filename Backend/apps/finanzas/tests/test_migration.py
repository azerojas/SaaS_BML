import uuid
from django.db import connection,IntegrityError,transaction
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase
from apps.finanzas.models import AdvanceApplication
from apps.finanzas.infrastructure.schema import ensure_ready
from apps.finanzas.domain.errors import FinanceError


class MigrationTests(TestCase):
    def signature(self):
        with connection.cursor() as c:
            c.execute("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name NOT IN ('idempotency_records','aplicaciones_anticipo') ORDER BY 1,ordinal_position")
            columns=c.fetchall()
            c.execute("SELECT viewname,definition FROM pg_views WHERE schemaname='public' ORDER BY viewname")
            return columns,c.fetchall()

    def test_additive_migration_reverse_and_forward_preserve_original_schema(self):
        before=self.signature()
        MigrationExecutor(connection).migrate([('finanzas',None)])
        with self.assertRaises(FinanceError):ensure_ready()
        MigrationExecutor(connection).migrate([('finanzas','0002_cash_ledger')])
        ensure_ready()
        self.assertEqual(before,self.signature())

    def test_new_tables_have_real_foreign_keys_and_positive_application_check(self):
        with connection.cursor() as c:
            c.execute("SELECT conname FROM pg_constraint WHERE conrelid='aplicaciones_anticipo'::regclass AND contype='f'")
            names={row[0] for row in c.fetchall()}
        self.assertIn('fk_aplicacion_anticipo',names)
        self.assertIn('fk_aplicacion_venta',names)
        with self.assertRaises(IntegrityError),transaction.atomic():
            AdvanceApplication.objects.create(anticipo_id=999999,venta_id=999999,monto=1,clave_operacion=uuid.uuid4(),creado_por_id=999999)

