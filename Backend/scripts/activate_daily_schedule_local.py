"""Reviewed, additive activation on the existing Lasheo local database only.

Default is read-only planning. --apply requires a fresh verified encrypted backup,
checks every legacy table before/after, and grants only the new support objects.
Credentials are loaded by existing private settings, never passed on the CLI.
"""
import argparse
from datetime import datetime, timezone, timedelta
import hashlib
import json
import os
from pathlib import Path
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = Path.home() / '.codex/lasheo-private/local-operation'
sys.path.insert(0, str(ROOT))


def role_from_file(name):
    values = dict(line.split('=', 1) for line in (PRIVATE / name).read_text().splitlines()
        if '=' in line and not line.startswith('#'))
    return urlsplit(values['DATABASE_URL']).username


def legacy_fingerprint(connection):
    from negocio import models as m
    tables = sorted(model._meta.db_table for model in vars(m).values()
        if isinstance(model, type) and hasattr(model, '_meta') and model._meta.app_label == 'negocio'
        and not model._meta.db_table.startswith('vw_'))
    assert len(tables) == 34
    result = {'rows': {}}
    with connection.cursor() as cursor:
        for table in tables:
            cursor.execute('SELECT count(*),md5(COALESCE(string_agg(md5(row_to_json(t)::text),\'\' ORDER BY row_to_json(t)::text),\'\')) FROM ' + connection.ops.quote_name(table) + ' t')
            result['rows'][table] = cursor.fetchone()
        queries = {
            'columns': ("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY(%s) ORDER BY 1,ordinal_position", [tables]),
            'constraints': ("SELECT conrelid::regclass::text,conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace='public'::regnamespace AND conrelid::regclass::text=ANY(%s) ORDER BY 1,2", [tables]),
            'indexes': ("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=ANY(%s) ORDER BY 1,2", [tables]),
            'views': ("SELECT viewname,definition FROM pg_views WHERE schemaname='public' ORDER BY 1", []),
            'functions': ("SELECT proname,pg_get_functiondef(oid) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'fn_%' ORDER BY 1", []),
        }
        for name, (query, params) in queries.items():
            cursor.execute(query, params or None)
            result[name] = hashlib.sha256(json.dumps(cursor.fetchall(), default=str).encode()).hexdigest()
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    assert json.loads((PRIVATE / 'prepared.json').read_text())['prepared']
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
    import django
    django.setup()
    from django.db import connection, transaction
    from django.db.migrations.executor import MigrationExecutor
    from django.core.management import call_command
    with connection.cursor() as cursor:
        cursor.execute('SELECT current_database(),current_user')
        assert cursor.fetchone() == ('Lasheo', 'postgres'), 'Only the prepared local Lasheo owner may activate this change.'
    target = [('agenda', '0003_daily_schedule')]
    plan = MigrationExecutor(connection).migration_plan(target)
    expected = {('agenda', '0002_public_booking'), ('agenda', '0003_daily_schedule')}
    assert all(not backwards and (migration.app_label, migration.name) in expected for migration, backwards in plan)
    print(json.dumps({'target': 'Lasheo', 'plan': [migration.name for migration, _ in plan], 'apply': args.apply}))
    if not args.apply or not plan:
        return
    backup = json.loads((PRIVATE / 'last-backup-job.json').read_text())
    restored = json.loads((PRIVATE / 'last-restore-job.json').read_text())
    assert backup['status'] == restored['status'] == 'SUCCESS'
    assert restored['detail']['verified'] and restored['detail']['role_policy_verified']
    for record in (backup, restored):
        assert datetime.now(timezone.utc) - datetime.fromisoformat(record['at']) < timedelta(hours=2)
    assert role_from_file('runtime-windows.env') == 'beauty_lasheo_runtime'
    assert role_from_file('backup-windows.env') == 'beauty_lasheo_backup'
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL lock_timeout='5s'")
            cursor.execute("SET LOCAL statement_timeout='30s'")
            for key in (718302453, 718302451, 718302455):
                cursor.execute('SELECT pg_advisory_xact_lock(%s)', [key])
        before = legacy_fingerprint(connection)
        call_command('migrate', 'agenda', '0003_daily_schedule', interactive=False, verbosity=0)
        with connection.cursor() as cursor:
            cursor.execute('GRANT SELECT,INSERT,UPDATE ON agenda_publicbookingrequest TO beauty_lasheo_runtime')
            cursor.execute('GRANT SELECT,INSERT ON agenda_publicbookingintent TO beauty_lasheo_runtime')
            cursor.execute('GRANT SELECT,INSERT,UPDATE,DELETE ON agenda_dailyschedule TO beauty_lasheo_runtime')
            cursor.execute('GRANT SELECT ON agenda_publicbookingrequest,agenda_publicbookingintent,agenda_dailyschedule TO beauty_lasheo_backup')
            for table in ('agenda_publicbookingintent', 'agenda_dailyschedule'):
                cursor.execute("SELECT pg_get_serial_sequence(%s,'id')", [table])
                sequence = cursor.fetchone()[0]
                assert sequence == 'public.' + table + '_id_seq'
                quoted = 'public.' + connection.ops.quote_name(table + '_id_seq')
                cursor.execute('GRANT USAGE,SELECT ON SEQUENCE ' + quoted + ' TO beauty_lasheo_runtime')
                cursor.execute('GRANT SELECT ON SEQUENCE ' + quoted + ' TO beauty_lasheo_backup')
            cursor.execute("SELECT has_table_privilege('beauty_lasheo_runtime','agenda_dailyschedule','UPDATE'),has_table_privilege('beauty_lasheo_runtime','agenda_publicbookingintent','DELETE'),has_table_privilege('beauty_lasheo_runtime','finanzas_reembolso','UPDATE')")
            assert cursor.fetchone() == (True, False, False)
        after = legacy_fingerprint(connection)
        assert before == after, 'Legacy rows/schema changed; activation rolled back.'
    report = {'applied': True, 'at': datetime.now(timezone.utc).isoformat(), 'migrations': [migration.name for migration, _ in plan],
        'legacy_tables_preserved': 34, 'legacy_rows_and_schema_match': True, 'precise_runtime_grants': True,
        'backup': backup['detail']['encrypted_file'], 'restore_verified': True}
    (PRIVATE / 'agenda-daily-activation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
