"""Apply reviewed additive migrations and verify existing schema and row counts."""
import hashlib
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from django.core.management import call_command
from django.db import connection
from django.apps import apps

tables = sorted(m._meta.db_table for m in apps.get_app_config('negocio').get_models() if not m._meta.db_table.startswith('vw_'))


def capture():
    result = {}
    with connection.cursor() as c:
        for table in tables:
            c.execute('SELECT count(*) FROM ' + connection.ops.quote_name(table))
            result['count:' + table] = c.fetchone()[0]
        queries = {
            'columns': "SELECT table_name,column_name,data_type,is_nullable,column_default,is_identity FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY(%s) ORDER BY table_name,ordinal_position",
            'views': "SELECT viewname,definition FROM pg_views WHERE schemaname='public' ORDER BY viewname",
            'functions': "SELECT proname,pg_get_functiondef(oid) FROM pg_proc WHERE pronamespace='public'::regnamespace AND prokind='f' ORDER BY proname,oid",
            'triggers': "SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY(%s)) ORDER BY tgname",
            'indexes': "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=ANY(%s) ORDER BY tablename,indexname",
            'constraints': "SELECT conrelid::regclass::text,conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace='public'::regnamespace AND conrelid IN (SELECT oid FROM pg_class WHERE relname=ANY(%s)) AND conname NOT LIKE 'fase1_%%' ORDER BY 1,2",
        }
        for label, query in queries.items():
            c.execute(query, [tables] if '%s' in query else None)
            result[label] = hashlib.sha256(json.dumps(c.fetchall(), default=str).encode()).hexdigest()
    return result


if not list((ROOT / 'backups').glob('*_before_phase1.dump')):
    raise RuntimeError('Create a backup before migrating.')
before = capture()
call_command('check', databases=['default'])
call_command('migrate', interactive=False)
after = capture()
if before != after:
    raise RuntimeError('Legacy schema/data counts changed; inspect before continuing.')
report = {'legacy_tables': len(tables), 'legacy_views': 7,
          'original_schema_and_row_counts_preserved': True, 'fingerprints': after}
(ROOT / 'backups/phase1-verification.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print('Verified: legacy rows, columns, constraints, indexes, triggers, functions and views unchanged.')
