"""Local-only reviewed additive change. Dry run unless --apply; verify a new encrypted backup first."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import tarfile
ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT),str(ROOT/'scripts')]
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
parser.add_argument('--verify-backup',type=Path)
args=parser.parse_args()
assert settings.APP_ENV=='development' and settings.DATABASES['default']['NAME']=='Lasheo'
plan=MigrationExecutor(connection)
pending=[(migration.app_label,migration.name) for migration,backwards in plan.migration_plan(plan.loader.graph.leaf_nodes())]
if not pending:
    if not args.verify_backup:
        print('Ledger already activated; no mutation.');raise SystemExit(0)
else:assert pending==[('finanzas','0002_cash_ledger')],pending
print('Reviewed proposal: docs/six-controls-schema-plan.md; only 3 support tables and permission metadata.')
if not args.apply and not args.verify_backup:raise SystemExit(0)
key=(Path.home()/'.codex/lasheo-private/phase8-backup.key').read_text().strip()
env={**os.environ,'BACKUP_ENCRYPTION_KEY':key}
connection.ensure_connection()
details={}
if args.verify_backup:
    from apps.operaciones.infrastructure.backup_crypto import decrypt,parse_key
    with tempfile.TemporaryDirectory(dir=Path.home()/'.codex/lasheo-private') as folder:
        plain=Path(folder)/'verified.tar'
        decrypt(args.verify_backup,plain,parse_key(key))
        with tarfile.open(plain) as tar:manifest=json.load(tar.extractfile('manifest.json'))
    before,details=manifest['fingerprint'],manifest['structure']
    import hashlib
    with args.verify_backup.open('rb') as stream:checksum=hashlib.file_digest(stream,'sha256').hexdigest()
    backup={'sha256':checksum}
else:
    result=subprocess.run([sys.executable,'scripts/backup_database.py','--output-dir','backups/encrypted'],cwd=ROOT,env=env,capture_output=True,check=True)
    backup=json.loads(result.stdout)
    subprocess.run([sys.executable,'scripts/restore_verify.py','--archive','backups/encrypted/'+backup['encrypted_file'],'--report','backups/six-controls-before-ledger-restore.json'],cwd=ROOT,env=env,check=True)
    before=fingerprint(connection.connection,details)
oldtables=set(before['rows'])
oldrelations=oldtables|{row[0] for row in details['views']}
if not args.verify_backup:call_command('migrate','finanzas','0002_cash_ledger',interactive=False,verbosity=1)
newdetails={}
after=fingerprint(connection.connection,newdetails)
assert len(after['rows'])==len(before['rows'])+3
for kind,rows in details.items():
    newrows=newdetails[kind]
    if kind in ('columns','constraints','indexes','triggers'):newrows=[row for row in newrows if row[0] in oldrelations]
    assert json.dumps(rows,default=str)==json.dumps(newrows,default=str),kind
for table,signature in before['rows'].items():
    if table not in ('auth_permission','django_content_type','django_migrations'):assert signature==after['rows'][table],table
report={'activated':True,'tables_before':len(before['rows']),'tables_after':len(after['rows']),'new_support_tables':3,
    'original_schema_and_nonmetadata_rows_preserved':True,'backup_restored':True,'backup_sha256':backup['sha256']}
(ROOT/'backups/six-controls-ledger-activation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
