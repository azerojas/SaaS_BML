"""Reviewed, explicit LOCAL support activation; dry-run by default. Requires separate user authorization."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
sys.path.insert(0,str(ROOT/'scripts'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()
from django.conf import settings
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.core.management import call_command
from backup_common import fingerprint

parser=argparse.ArgumentParser()
parser.add_argument('--apply',action='store_true')
parser.add_argument('--expected-database',required=True)
args=parser.parse_args()
if settings.APP_ENV!='development' or settings.DATABASES['default']['NAME']!=args.expected_database:
    raise SystemExit('Only the exact reviewed local development database may be activated.')
executor=MigrationExecutor(connection)
pending=[(migration.app_label,migration.name) for migration,backward in executor.migration_plan(executor.loader.graph.leaf_nodes())]
if not pending and ('operaciones','0001_security_and_job_state') in executor.recorder.applied_migrations():
    assert {'operaciones_mfadevice','operaciones_jobstate'}<=set(connection.introspection.table_names())
    print(json.dumps({'already_activated':True,'changes_applied':False,'pending':[]}))
    raise SystemExit(0)
if pending!=[('operaciones','0001_security_and_job_state')]:raise SystemExit('Unexpected pending migration plan; review before activation.')
print(json.dumps({'dry_run':not args.apply,'pending':pending,'business_changes':False,'new_tables':2}))
if not args.apply:raise SystemExit(0)
if os.environ.get('PHASE8_ACTIVATION_APPROVED')!='True':raise SystemExit('Explicit user approval required; set approval flag only after receiving it.')
key_file=Path(os.environ['USERPROFILE'])/'.codex/lasheo-private/phase8-backup.key'
key=key_file.read_text(encoding='ascii').strip()
env={**os.environ,'BACKUP_ENCRYPTION_KEY':key}
output=ROOT/'backups/encrypted'
result=subprocess.run([sys.executable,'scripts/backup_database.py','--output-dir',str(output)],cwd=ROOT,env=env,capture_output=True,check=True)
backup=json.loads(result.stdout)
archive=output/backup['encrypted_file']
subprocess.run([sys.executable,'scripts/restore_verify.py','--archive',str(archive),'--report','backups/phase8-activation-restore.json'],cwd=ROOT,env=env,check=True)

def signature():
    connection.ensure_connection()
    structure={}
    data=fingerprint(connection.connection,structure)
    # New metadata and the two support tables are the only allowed additions.
    data={key:value for key,value in data['rows'].items() if key not in ('auth_permission','django_content_type','django_migrations') and not key.startswith('operaciones_')}
    original={}
    with connection.cursor() as cursor:
        cursor.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE 'operaciones_%' ORDER BY 1")
        tables={row[0] for row in cursor.fetchall()}
    for kind,rows in structure.items():
        if kind=='columns':rows=[row for row in rows if row[0] in tables]
        elif kind in ('constraints','indexes','triggers'):rows=[row for row in rows if row[0] in tables]
        original[kind]=rows
    return data,original

before=signature()
if len(before[0])<30:raise RuntimeError('Row fingerprint inventory incomplete.')
call_command('migrate','operaciones','0001_security_and_job_state',interactive=False,verbosity=1)
after=signature()
if before!=after:raise RuntimeError('Preservation check FAILED. Stop operations; do not auto-reverse or overwrite data.')
with connection.cursor() as cursor:
    cursor.execute("SELECT count(*) FROM pg_tables WHERE schemaname='public'")
    tables=cursor.fetchone()[0]
    cursor.execute("SELECT count(*) FROM pg_views WHERE schemaname='public'")
    views=cursor.fetchone()[0]
assert tables==49 and views==7
report={'activated':True,'physical_tables':tables,'views':views,'original_schema_preserved':True,'original_nonmetadata_rows_preserved':True,
    'backup_sha256':backup['sha256'],'backup_restore_verified':True,'role_policy_applied':False,'mfa_required_local':settings.MFA_REQUIRED,
    'maintenance_jobs_enabled':settings.ALLOW_MAINTENANCE_JOBS,'production_deployed':False}
(ROOT/'backups/phase8-activation-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
