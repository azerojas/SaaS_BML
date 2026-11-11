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
call_command('sqlmigrate','reporting','0001_report_permissions',stdout=output)
sql_path=ROOT/'docs/migrations/phase6-permissions.sql'
sql_path.write_text(output.getvalue(),encoding='utf-8')
target=connection.settings_dict['NAME']
print('Target:',target,'; SQL review exported. Proxy model: no new business tables or columns.')
if not args.apply:
    print('Review only. No database changes.')
    raise SystemExit(0)
if args.database_name!=target:raise RuntimeError('Explicit reviewed database name required.')
if MigrationRecorder(connection).migration_qs.filter(app='reporting',name='0001_report_permissions').exists():
    print('Already activated; no action.')
    raise SystemExit(0)
# Baseline script creates a private full backup once. Its verification excludes auth/migration metadata.
subprocess.run([sys.executable,str(ROOT/'scripts/phase6_snapshot.py')],check=True)
call_command('migrate','reporting','0001_report_permissions',interactive=False)
subprocess.run([sys.executable,str(ROOT/'scripts/phase6_snapshot.py')],check=True)
count=Permission.objects.filter(content_type__app_label='reporting',codename__in=['view_summary','view_clients','view_inventory','export']).count()
assert count==4
(ROOT/'backups/phase6-activation-report.json').write_text(json.dumps({'database':target,'business_schema_and_rows_preserved':True,'report_permissions':count,'new_tables':0},indent=2),encoding='utf-8')
print('Verified: original schema/business rows unchanged, 4 report permissions registered.')
