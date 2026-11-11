"""Review/apply ONLY the proposed additive migration; never called automatically."""
import argparse
import hashlib
import io
import json
import os
import subprocess
import sys
from datetime import datetime,timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()
from django.conf import settings
from django.apps import apps
from django.core.management import call_command
from django.db import connection
from django.db.migrations.recorder import MigrationRecorder

parser=argparse.ArgumentParser()
parser.add_argument('--apply',action='store_true')
parser.add_argument('--database-name')
args=parser.parse_args()
target=connection.settings_dict['NAME']
print('Target database:',target)
output=io.StringIO()
call_command('sqlmigrate','finanzas','0001_finance_support',stdout=output)
review=ROOT/'docs/migrations/phase5-additive.sql'
review.parent.mkdir(exist_ok=True)
review.write_text(output.getvalue(),encoding='utf-8')
print('Review SQL:',review.name)
if not args.apply:
    print('Review only. No database changes.')
    raise SystemExit(0)
if args.database_name!=target:
    raise RuntimeError('--database-name must exactly match the reviewed target.')
if MigrationRecorder(connection).migration_qs.filter(app='finanzas',name='0001_finance_support').exists():
    print('Migration already applied; no action.')
    raise SystemExit(0)


def fingerprint(tables):
    result={}
    with connection.cursor() as c:
        queries={
            'columns':"SELECT table_name,column_name,data_type,is_nullable,column_default,is_identity FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY(%s) ORDER BY 1,ordinal_position",
            'constraints':"SELECT conrelid::regclass::text,conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY(%s)) ORDER BY 1,2",
            'indexes':"SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=ANY(%s) ORDER BY 1,2",
            'triggers':"SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY(%s)) ORDER BY 1",
            'views':"SELECT viewname,definition FROM pg_views WHERE schemaname='public' ORDER BY 1",
        }
        for label,query in queries.items():
            c.execute(query,[tables] if '%s' in query else None)
            result[label]=hashlib.sha256(json.dumps(c.fetchall(),default=str).encode()).hexdigest()
        for model in apps.get_app_config('negocio').get_models():
            table=model._meta.db_table
            if table.startswith('vw_'):continue
            c.execute("SELECT count(*),md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY row_to_json(t)::text),'')) FROM "+connection.ops.quote_name(table)+' t')
            result['rows:'+table]=list(c.fetchone())
    return result


with connection.cursor() as c:
    c.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
    original=[row[0] for row in c.fetchall()]
before=fingerprint(original)
db=connection.settings_dict
pg=Path(os.environ.get('PG_BIN',r'C:\Program Files\PostgreSQL\18\bin'))
backup=ROOT/'backups'/(datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'_before_phase5_activation.dump')
with backup.open('wb') as file:
    subprocess.run([str(pg/'pg_dump.exe'),'-h',db['HOST'],'-p',str(db['PORT']),'-U',db['USER'],'-d',db['NAME'],
        '--no-owner','--no-privileges','-Fc'],env={**os.environ,'PGPASSWORD':db['PASSWORD']},stdout=file,check=True)
with backup.open('rb') as file:
    subprocess.run([str(pg/'pg_restore.exe'),'--list'],stdin=file,stdout=subprocess.DEVNULL,check=True)
call_command('migrate','finanzas','0001_finance_support',interactive=False)
after=fingerprint(original)
if before!=after:
    raise RuntimeError('Original schema/business data changed; investigate before any financial operations.')
with connection.cursor() as c:
    c.execute("SELECT tablename FROM pg_tables WHERE schemaname='public'")
    names={row[0] for row in c.fetchall()}
assert names-set(original)=={'idempotency_records','aplicaciones_anticipo'}
report={'database':target,'original_tables_preserved':len(original),'new_tables':sorted(names-set(original)),
        'legacy_schema_and_business_rows_preserved':True,'backup':backup.name,'fingerprints':after}
(ROOT/'backups/phase5-activation-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('Verified: only two support tables added; original schema/business rows preserved.')

