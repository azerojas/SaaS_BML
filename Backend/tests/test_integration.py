from django.apps import apps
from django.db import connection, IntegrityError, transaction
from django.test import TestCase
from django.conf import settings
from django.urls import resolve
import json
from apps.integracion.user_links import USER_LINKS, restore_links, remove_links


class SchemaIntegrationTests(TestCase):
    def test_documented_routes_and_schema_references(self):
        document = json.loads((settings.BASE_DIR / 'docs/openapi.json').read_text(encoding='utf-8'))
        for path in document['paths']:
            resolve(path.replace('{id}', '1').replace('{slug}', 'ficticio').replace('{token}', '550e8400-e29b-41d4-a716-446655440000').replace('{key}', '550e8400-e29b-41d4-a716-446655440000'))
        def validate_refs(value):
            if isinstance(value, dict):
                if '$ref' in value:
                    self.assertIn(value['$ref'].split('/')[-1], document['components']['schemas'])
                for child in value.values():
                    validate_refs(child)
            elif isinstance(value, list):
                for child in value:
                    validate_refs(child)
        validate_refs(document)

    def test_legacy_tables_views_and_links(self):
        with connection.cursor() as c:
            c.execute("SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE 'auth_%' AND tablename NOT LIKE 'django_%' AND tablename <> 'autenticacion_loginattempt' AND tablename NOT LIKE 'operaciones_%' AND tablename NOT LIKE 'finanzas_%' AND tablename NOT IN ('idempotency_records','aplicaciones_anticipo')")
            self.assertEqual(c.fetchone()[0], 34)
            c.execute("SELECT count(*) FROM pg_views WHERE schemaname='public'")
            self.assertEqual(c.fetchone()[0], 7)
            c.execute("SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname LIKE 'fase1_%' AND contype='f'")
            self.assertEqual(c.fetchone()[0], 13)
            c.execute("SELECT data_type FROM information_schema.columns WHERE table_name='auth_user' AND column_name='id'")
            self.assertEqual(c.fetchone()[0], 'integer')
            c.execute("SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='f' AND conrelid NOT IN (SELECT oid FROM pg_class WHERE relname LIKE 'auth_%' OR relname LIKE 'django_%' OR relname LIKE 'operaciones_%' OR relname LIKE 'finanzas_%' OR relname IN ('idempotency_records','aplicaciones_anticipo'))")
            self.assertEqual(c.fetchone()[0], 58)

    def test_all_legacy_models_unmanaged(self):
        models = list(apps.get_app_config('negocio').get_models())
        self.assertEqual(len([model for model in models if not model._meta.db_table.startswith('vw_')]), 34)
        self.assertEqual(len([model for model in models if model._meta.db_table.startswith('vw_')]), 3)
        self.assertTrue(all(not model._meta.managed for model in models))

    def test_user_links_reject_orphans(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            with connection.cursor() as c:
                c.execute("INSERT INTO auditoria(usuario_id,entidad,accion) VALUES (2147483647,'prueba','CREAR')")

    def test_fk_migration_reversible(self):
        with connection.schema_editor() as editor:
            remove_links(None, editor)
            restore_links(None, editor)
        with connection.cursor() as c:
            c.execute("SELECT count(*) FROM pg_constraint WHERE conname LIKE 'fase1_%' AND contype='f'")
            self.assertEqual(c.fetchone()[0], len(USER_LINKS))

