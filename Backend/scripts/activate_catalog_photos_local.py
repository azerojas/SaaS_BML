"""Activate the additive photo table on the prepared local database."""
import argparse
from datetime import datetime, timezone, timedelta
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = Path.home() / '.codex/lasheo-private/local-operation'
sys.path.insert(0, str(ROOT))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
    import django
    django.setup()
    from django.db import connection, transaction
    from django.db.migrations.executor import MigrationExecutor
    from django.core.management import call_command
    from activate_daily_schedule_local import legacy_fingerprint, role_from_file
    assert json.loads((PRIVATE / 'prepared.json').read_text())['prepared']
    with connection.cursor() as cursor:
        cursor.execute('SELECT current_database(), current_user')
        assert cursor.fetchone() == ('Lasheo', 'postgres')
    target = [('catalogo', '0001_uploaded_photo')]
    plan = MigrationExecutor(connection).migration_plan(target)
    assert all(not backwards and (migration.app_label, migration.name) == target[0]
               for migration, backwards in plan)
    print(json.dumps({'apply': args.apply, 'migrations': [m.name for m, _ in plan]}))
    if not args.apply or not plan:
        return
    for name in ('backup', 'restore'):
        result = json.loads((PRIVATE / ('last-' + name + '-job.json')).read_text())
        assert result['status'] == 'SUCCESS'
        assert datetime.now(timezone.utc) - datetime.fromisoformat(result['at']) < timedelta(hours=2)
        if name == 'restore':
            assert result['detail']['verified'] and result['detail']['role_policy_verified']
    assert role_from_file('runtime-windows.env') == 'beauty_lasheo_runtime'
    assert role_from_file('backup-windows.env') == 'beauty_lasheo_backup'
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL lock_timeout = '5s'")
            for key in (718302453, 718302451, 718302455, 718302452):
                cursor.execute('SELECT pg_advisory_xact_lock(%s)', [key])
        before = legacy_fingerprint(connection)
        call_command('migrate', 'catalogo', '0001_uploaded_photo', interactive=False, verbosity=0)
        assert before == legacy_fingerprint(connection), 'Existing business data changed; rolled back.'
        with connection.cursor() as cursor:
            cursor.execute('GRANT SELECT, INSERT, DELETE ON catalogo_uploadedphoto TO beauty_lasheo_runtime')
            cursor.execute('GRANT SELECT ON catalogo_uploadedphoto TO beauty_lasheo_backup')
            cursor.execute("SELECT has_table_privilege('beauty_lasheo_runtime', 'catalogo_uploadedphoto', 'INSERT'), "
                           "has_table_privilege('beauty_lasheo_backup', 'catalogo_uploadedphoto', 'SELECT')")
            assert cursor.fetchone() == (True, True)
    report = {'applied': True, 'migration': target[0][1], 'legacy_rows_and_schema_match': True,
              'at': datetime.now(timezone.utc).isoformat()}
    (PRIVATE / 'catalog-photos-activation.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report))


if __name__ == '__main__':
    main()
