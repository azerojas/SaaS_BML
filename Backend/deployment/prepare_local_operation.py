"""User-authorized LOCAL setup. Unique project roles, optional native TLS, MFA and private configurations."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
from urllib.parse import quote
ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT),str(ROOT/'deployment')]
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()
from django.conf import settings
from django.db import connection
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group,Permission
from django.core.management import call_command
from cryptography.fernet import Fernet
import psycopg
from psycopg import sql
from local_certificates import create,private_write

assert settings.APP_ENV=='development' and settings.DATABASES['default']['NAME']=='Lasheo'
PRIVATE=Path.home()/'.codex/lasheo-private/local-operation'
PRIVATE.mkdir(parents=True,exist_ok=True)
if (PRIVATE/'prepared.json').exists():
    print('Already prepared; no mutation. Preserve credentials and use explicit rotation procedure.')
    raise SystemExit(0)
create(PRIVATE/'certificates')
certs=PRIVATE/'certificates'
db=settings.DATABASES['default']
with connection.cursor() as cursor:
    cursor.execute("SELECT current_setting('ssl'),current_setting('data_directory'),current_setting('ssl_cert_file'),current_setting('ssl_key_file')")
    old=cursor.fetchone()
tls=Path(old[1])/'beauty_local_tls'
tls.mkdir(exist_ok=True)
if old[0]!='off':raise SystemExit('Existing cluster TLS must be reviewed rather than replaced automatically.')
# Add TLS capability without changing HBA, listen_addresses, existing clients or other databases.
for filename in ('server.crt','server.key'):private_write(tls/filename,(certs/filename).read_bytes())
sid=subprocess.check_output(['whoami','/user','/fo','csv','/nh'],text=True).strip().split(',')[-1].strip('"')
subprocess.run(['icacls',str(tls),'/inheritance:r','/grant:r',f'*{sid}:(OI)(CI)F','*S-1-5-20:(OI)(CI)R','*S-1-5-18:(OI)(CI)F'],check=True,stdout=subprocess.DEVNULL)
# Files inherit project directory ACLs; do not recursively remove file access.
subprocess.run(['icacls',str(tls/'*'),'/inheritance:e','/T','/Q'],check=True,stdout=subprocess.DEVNULL)
private_write(PRIVATE/'postgres-tls-before.json',json.dumps({'ssl':old[0],'ssl_cert_file':old[2],'ssl_key_file':old[3]}).encode())
with connection.cursor() as cursor:
    for name,value in [('ssl_cert_file',(tls/'server.crt').as_posix()),('ssl_key_file',(tls/'server.key').as_posix()),('ssl','on')]:
        cursor.execute(sql.SQL('ALTER SYSTEM SET {} = {}').format(sql.Identifier(name),sql.Literal(value)))
    cursor.execute('SELECT pg_reload_conf()')
for _ in range(30):
    try:
        with psycopg.connect(dbname=db['NAME'],user=db['USER'],password=db['PASSWORD'],host='127.0.0.1',port=db['PORT'],sslmode='verify-full',sslrootcert=str(certs/'ca.crt'),connect_timeout=5) as verified:
            assert verified.execute('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()').fetchone()==(True,)
        break
    except psycopg.OperationalError:
        time.sleep(.25)
else:raise RuntimeError('Native TLS failed verification; review postgres-tls-before.json and revert TLS settings, do not weaken client verification.')

roles={name:'beauty_lasheo_'+name for name in ('runtime','backup','restore')}
passwords={name:secrets.token_urlsafe(36) for name in roles}
with connection.cursor() as cursor:
    for purpose,name in roles.items():
        cursor.execute('SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=%s)',[name])
        if cursor.fetchone()[0]:raise RuntimeError('Project role already exists; do not change unrelated credentials.')
        cursor.execute(sql.SQL('CREATE ROLE {} LOGIN PASSWORD {} NOSUPERUSER NOCREATEROLE {}').format(sql.Identifier(name),sql.Literal(passwords[purpose]),sql.SQL('CREATEDB' if purpose=='restore' else 'NOCREATEDB')))
    grants=(ROOT/'deployment/roles.sql').read_text().replace('beauty_runtime',roles['runtime']).replace('beauty_backup',roles['backup'])
    cursor.execute(grants)
    # Prevent protected financial payload changes even if a runtime credential is compromised.
    cursor.execute(sql.SQL('REVOKE UPDATE ON pagos FROM {}; GRANT UPDATE(estado) ON pagos TO {}').format(sql.Identifier(roles['runtime']),sql.Identifier(roles['runtime'])))

def envfile(name,values):
    private_write(PRIVATE/name,(''.join(key+'='+str(value)+'\n' for key,value in values.items())).encode())

key=Fernet.generate_key().decode()
base={'DJANGO_ENV':'staging','DJANGO_SETTINGS_MODULE':'config.settings.staging','SECRET_KEY':secrets.token_urlsafe(64),
    'MFA_ENCRYPTION_KEY':key,'ALLOWED_HOSTS':'localhost,127.0.0.1','CSRF_TRUSTED_ORIGINS':'https://localhost:8443',
    'CORS_ALLOWED_ORIGINS':'','DB_SSLMODE':'verify-full','DB_SSLROOTCERT':'/run/ca.crt','TRUST_PROXY_HTTPS':'True',
    'PRIVACY_NOTICE_URL':'https://localhost:8443/privacy/','PRIVACY_NOTICE_VERSION':'local-ficticio-v1',
    'PUBLIC_CHECKIN_URL':'https://localhost:8443/api/public/checkin/','CHECKIN_PRIVACY_NOTICE_URL':'https://localhost:8443/privacy/',
    'CHECKIN_PRIVACY_NOTICE_VERSION':'local-ficticio-v1','CHECKIN_DEMO_MODE':'False','ALLOW_MAINTENANCE_JOBS':'True','PORT':'8000',
    'PGSSLMODE':'verify-full','PGSSLROOTCERT':'/run/ca.crt'}
for purpose in roles:
    url='postgresql://'+roles[purpose]+':'+quote(passwords[purpose])+'@host.docker.internal:'+str(db['PORT'])+'/'+quote(db['NAME'])
    rolebase=base if purpose=='runtime' else {key:value for key,value in base.items() if key in ['DJANGO_ENV','DB_SSLMODE','DB_SSLROOTCERT','PGSSLMODE','PGSSLROOTCERT']}
    envfile(purpose+'.env',{**rolebase,'DATABASE_URL':url})
    envfile(purpose+'-windows.env',{**rolebase,'DATABASE_URL':url.replace('@host.docker.internal:','@127.0.0.1:'),
        'DB_SSLROOTCERT':str(certs/'ca.crt'),'PGSSLROOTCERT':str(certs/'ca.crt')})
import base64
backupkey=base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()
private_write(PRIVATE/'backup.key',backupkey.encode())
group,_=Group.objects.get_or_create(name='Administracion local Lasheo')
perms=Permission.objects.filter(content_type__app_label__in=['negocio','finanzas','agenda','reporting']).exclude(codename__startswith='delete_')
group.permissions.set(list(perms)+list(Permission.objects.filter(content_type__app_label='operaciones',codename='view_operations')))
username='operador_local'
if get_user_model().objects.filter(username=username).exists():raise RuntimeError('Local operator already exists; do not replace credentials silently.')
password=secrets.token_urlsafe(28)
user=get_user_model().objects.create_user(username,password=password,is_staff=True,is_superuser=False)
user.groups.add(group)
settings.MFA_ENCRYPTION_KEY=key
call_command('mfa_provision',username=username,output=str(PRIVATE/'operator.otpauth'),database_name=db['NAME'])
private_write(PRIVATE/'credentials.json',json.dumps({'url':'https://localhost:8443','username':username,'password':password,
    'mfa_uri_file':'operator.otpauth','test_data_only':True}).encode())
import segno
segno.make((PRIVATE/'operator.otpauth').read_text().strip(),error='m').save(PRIVATE/'operator-mfa.png',scale=6)
report={'prepared':True,'local_only':True,'native_postgres_tls_verified':True,'project_roles':roles,'other_databases_modified':False,
    'shared_cluster_change':'TLS capability enabled through reload only; existing non-TLS clients and HBA unchanged',
    'operator_created':True,'superuser':False,'mfa_enrollment_required':True,'rpo_minutes':60,'rto_minutes':120,
    'independent_backup_destination_available':False,'external_alert_channel_available':False}
private_write(PRIVATE/'prepared.json',json.dumps(report,indent=2).encode())
(ROOT/'backups/six-controls-local-preparation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
