"""Activate the nullable shared calendar on the prepared local DB after verified backup."""
import json
import os
from pathlib import Path
import sys
from datetime import datetime, timezone, timedelta

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = Path.home() / '.codex/lasheo-private/local-operation'
sys.path.insert(0, str(ROOT))


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
    import django
    django.setup()
    from django.db import connection, transaction
    from django.db.migrations.executor import MigrationExecutor
    from django.core.management import call_command
    from activate_daily_schedule_local import legacy_fingerprint
    assert json.loads((PRIVATE / 'prepared.json').read_text())['prepared']
    with connection.cursor() as cursor:
        cursor.execute('SELECT current_database(),current_user')
        assert cursor.fetchone() == ('Lasheo', 'postgres')
    target = [('agenda', '0004_shared_schedule')]
    plan = MigrationExecutor(connection).migration_plan(target)
    assert all(not backwards and (migration.app_label, migration.name) == target[0] for migration, backwards in plan)
    print(json.dumps({'apply': args.apply, 'migrations': [migration.name for migration, _ in plan]}))
    if not args.apply or not plan:
        return
    for name in ('backup', 'restore'):
        result = json.loads((PRIVATE / ('last-' + name + '-job.json')).read_text())
        assert result['status'] == 'SUCCESS'
        assert datetime.now(timezone.utc) - datetime.fromisoformat(result['at']) < timedelta(hours=2)
        if name == 'restore':
            assert result['detail']['verified'] and result['detail']['role_policy_verified']
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL lock_timeout='5s'")
            for key in (718302453, 718302451, 718302455):
                cursor.execute('SELECT pg_advisory_xact_lock(%s)', [key])
        before = legacy_fingerprint(connection)
        call_command('migrate', 'agenda', '0004_shared_schedule', interactive=False, verbosity=0)
        assert before == legacy_fingerprint(connection), 'Legacy rows/schema changed; rolled back.'
        with connection.cursor() as cursor:
            cursor.execute("SELECT has_table_privilege('beauty_lasheo_runtime','agenda_dailyschedule','INSERT'),has_table_privilege('beauty_lasheo_runtime','idempotency_records','UPDATE')")
            assert cursor.fetchone() == (True, False)
    report = {'applied': True, 'legacy_rows_and_schema_match': True,
              'at': datetime.now(timezone.utc).isoformat(), 'migration': '0004_shared_schedule'}
    (PRIVATE / 'agenda-shared-activation.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report))


if __name__ == '__main__':
    main()
