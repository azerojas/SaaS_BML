"""Review/apply permission metadata only, after explicit authorization. No business DDL."""
import argparse
import io
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()
from django.core.management import call_command
from django.db import connection
from django.contrib.auth.models import Permission
from django.db.migrations.recorder import MigrationRecorder

parser=argparse.ArgumentParser()
parser.add_argument('--apply',action='store_true')
parser.add_argument('--database-name')
args=parser.parse_args()
output=io.StringIO()
call_command('sqlmigrate','agenda','0001_agenda_permissions',stdout=output)
sql_path=ROOT/'docs/migrations/phase7-permissions.sql'
sql_path.write_text(output.getvalue(),encoding='utf-8')
target=connection.settings_dict['NAME']
print('Target:',target,'; SQL review exported. Proxy model: no new business tables or columns.')
if not args.apply:
    print('Review only. No database changes.')
    raise SystemExit(0)
if args.database_name!=target:raise RuntimeError('Explicit reviewed database name required.')
if MigrationRecorder(connection).migration_qs.filter(app='agenda',name='0001_agenda_permissions').exists():
    print('Already activated; no action.')
    raise SystemExit(0)
# Baseline script creates a private full backup once. Its verification excludes auth/migration metadata.
subprocess.run([sys.executable,str(ROOT/'scripts/phase7_snapshot.py')],check=True)
call_command('migrate','agenda','0001_agenda_permissions',interactive=False)
subprocess.run([sys.executable,str(ROOT/'scripts/phase7_snapshot.py')],check=True)
permissions=['view_agenda','manage_professionals','assign_users','manage_schedules','manage_blocks','manage_appointments','manage_waitlist','link_arrivals','configure_agenda','override_policy']
count=Permission.objects.filter(content_type__app_label='agenda',codename__in=permissions).count()
assert count==10
(ROOT/'backups/phase7-activation-report.json').write_text(json.dumps({'database':target,'business_schema_and_rows_preserved':True,'agenda_permissions':count,'new_tables':0},indent=2),encoding='utf-8')
print('Verified: original schema/business rows unchanged, 10 agenda permissions registered.')

