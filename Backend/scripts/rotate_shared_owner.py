"""Explicit shared administrative credential rotation; never part of routine application startup."""
import argparse
import json
import os
from pathlib import Path
import secrets
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()
from django.conf import settings
from django.db import connection
from config.environment import development_env
from psycopg import sql
import psycopg

parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');args=parser.parse_args()
assert settings.APP_ENV=='development' and settings.DATABASES['default']['USER']=='postgres'
print(json.dumps({'shared_role':'postgres','affects_all_databases':True,'application_runtime_credential_changes':False,'apply':args.apply}))
if not args.apply:raise SystemExit(0)
assert os.environ.get('LASHEO_SHARED_ADMIN_ROTATION_APPROVED')=='True'
with connection.cursor() as cursor:
    cursor.execute('SHOW server_version');assert cursor.fetchone()[0]=='18.6'
private=Path.home()/'.codex/lasheo-private'
target=private/'local-operation/admin-migrator-password.txt'
if target.exists():raise SystemExit('Rotation artifact exists; review rather than overwrite.')
password=secrets.token_urlsafe(48)
with os.fdopen(os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w') as file:file.write(password+'\n')
verifier=connection.connection.pgconn.encrypt_password(password.encode(),b'postgres',b'scram-sha-256').decode()
with connection.cursor() as cursor:cursor.execute(sql.SQL('ALTER ROLE postgres PASSWORD {}').format(sql.Literal(verifier)))
db=settings.DATABASES['default']
with psycopg.connect(dbname=db['NAME'],user='postgres',password=password,host='127.0.0.1',port=db['PORT'],
    sslmode='verify-full',sslrootcert=str(private/'local-operation/certificates/ca.crt')) as verified:assert verified.execute('SELECT 1').fetchone()==(1,)
path=development_env(ROOT)
lines=path.read_text(encoding='utf-8-sig').splitlines()
assert any(line.startswith('DB_PASSWORD=') for line in lines)
lines=['DB_PASSWORD='+password if line.startswith('DB_PASSWORD=') else line for line in lines]
path.write_text('\n'.join(lines)+'\n',encoding='utf-8')
report={'rotated':True,'role':'postgres','new_connection_verified_tls':True,'private_development_environment_updated':True,
    'runtime_backup_restore_role_credentials_unchanged':True,'other_apps_must_update_saved_admin_password':True}
(ROOT/'backups/six-controls-admin-rotation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
