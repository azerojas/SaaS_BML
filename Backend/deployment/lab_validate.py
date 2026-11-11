"""Disposable LOCAL synthetic staging: PostgreSQL TLS, least-privilege runtime, non-root Gunicorn and real HTTPS/MFA smoke.
The HTTPS proxy here is a loopback test harness, not a production proxy or a public service.
"""
import base64
import http.client
import http.cookiejar
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import ipaddress
import json
import os
from pathlib import Path
import secrets
import ssl
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime,timedelta,timezone
from urllib.parse import quote
from urllib.request import build_opener,HTTPCookieProcessor,HTTPSHandler,Request
from urllib.error import HTTPError
from cryptography import x509
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.fernet import Fernet
from cryptography.x509.oid import NameOID
from cryptography.x509.oid import ExtendedKeyUsageOID
from django_otp.oath import TOTP

ROOT=Path(__file__).resolve().parents[1]
PG_IMAGE='postgres:18.6-alpine3.23@sha256:a0cbdbbcc57f7317ca183ac9d10eb3af72b5b05b2f25acad58e765bd2b139099'
IMAGE='beauty-manager:phase8-local'
LAB='beauty-phase8-'+uuid.uuid4().hex[:8]
PRIVATE=Path(os.environ['USERPROFILE'] if os.name=='nt' else Path.home())/'.codex'/'lasheo-private'/LAB
PRIVATE.mkdir(parents=True)
DB='bm_staging_synthetic_'+uuid.uuid4().hex[:8]
log=(ROOT/'backups/phase8-lab-validation.log').open('wb')
resources={'network':LAB,'database':LAB+'-db','web':LAB+'-web','data_volume':LAB+'-data','tls_volume':LAB+'-tls'}


def docker(*args,input=None,capture=False):
    result=subprocess.run(['docker',*args],input=input,stdout=subprocess.PIPE if capture else log,stderr=log)
    if result.returncode:raise RuntimeError('Docker stage failed; review private lab log. Command='+args[0])
    return result.stdout.decode().strip() if capture else None


def envfile(name,values):
    path=PRIVATE/name
    with os.fdopen(os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600),'w',encoding='utf-8') as file:
        for key,value in values.items():file.write(key+'='+str(value)+'\n')
    return path


def certificate():
    ca_key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
    name=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'Synthetic local staging CA')])
    now=datetime.now(timezone.utc)
    ca=x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(ca_key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now-timedelta(minutes=1)).not_valid_after(now+timedelta(days=7)).add_extension(x509.BasicConstraints(ca=True,path_length=0),critical=True).add_extension(x509.KeyUsage(digital_signature=True,content_commitment=False,key_encipherment=False,data_encipherment=False,key_agreement=False,key_cert_sign=True,crl_sign=True,encipher_only=False,decipher_only=False),critical=True).add_extension(x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()),critical=False).sign(ca_key,hashes.SHA256())
    server_key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
    server=x509.CertificateBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'staging-db')])).issuer_name(name).public_key(server_key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now-timedelta(minutes=1)).not_valid_after(now+timedelta(days=7)).add_extension(x509.SubjectAlternativeName([x509.DNSName('staging-db'),x509.DNSName('localhost'),x509.IPAddress(ipaddress.ip_address('127.0.0.1'))]),critical=False).add_extension(x509.BasicConstraints(ca=False,path_length=None),critical=True).add_extension(x509.KeyUsage(digital_signature=True,content_commitment=False,key_encipherment=True,data_encipherment=False,key_agreement=False,key_cert_sign=False,crl_sign=False,encipher_only=False,decipher_only=False),critical=True).add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]),critical=False).add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()),critical=False).sign(ca_key,hashes.SHA256())
    for filename,content in [('ca.crt',ca.public_bytes(serialization.Encoding.PEM)),('server.crt',server.public_bytes(serialization.Encoding.PEM)),
        ('server.key',server_key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))]:
        descriptor=os.open(PRIVATE/filename,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        with os.fdopen(descriptor,'wb') as file:file.write(content)


upstream=[0]
class Proxy(BaseHTTPRequestHandler):
    def handle_request(self):
        body=self.rfile.read(int(self.headers.get('Content-Length','0')))
        headers={name:value for name,value in self.headers.items() if name.lower() not in ('host','connection','x-forwarded-proto','x-forwarded-host')}
        headers.update({'Host':'localhost','X-Forwarded-Proto':'https'})
        connection=http.client.HTTPConnection('127.0.0.1',upstream[0],timeout=10)
        try:
            connection.request(self.command,self.path,body,headers)
            response=connection.getresponse()
        except (OSError,http.client.HTTPException):
            self.send_response(503)
            self.end_headers()
            self.wfile.write(b'{"status":"starting"}')
            connection.close()
            return
        content=response.read()
        self.send_response(response.status)
        for name,value in response.getheaders():
            if name.lower() not in ('connection','transfer-encoding','content-length'):self.send_header(name,value)
        self.send_header('Content-Length',str(len(content)))
        self.end_headers()
        self.wfile.write(content)
        connection.close()
    do_GET=handle_request
    do_POST=handle_request
    def log_message(self,*args):pass


certificate()
proxy=ThreadingHTTPServer(('127.0.0.1',0),Proxy)
context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.minimum_version=ssl.TLSVersion.TLSv1_2
context.load_cert_chain(PRIVATE/'server.crt',PRIVATE/'server.key')
proxy.socket=context.wrap_socket(proxy.socket,server_side=True)
origin='https://localhost:'+str(proxy.server_port)
password=secrets.token_urlsafe(32)
runtime_password=secrets.token_urlsafe(32)
admin_password=secrets.token_urlsafe(32)
totp_secret=secrets.token_hex(20)
key=Fernet.generate_key().decode()
owner=envfile('postgres.env',{'POSTGRES_PASSWORD':password,'POSTGRES_DB':DB})
base={'SECRET_KEY':secrets.token_urlsafe(64),'MFA_ENCRYPTION_KEY':key,'PRIVACY_NOTICE_URL':origin+'/privacy/',
      'PRIVACY_NOTICE_VERSION':'synthetic-local','PUBLIC_CHECKIN_URL':origin+'/api/public/checkin/',
      'CHECKIN_PRIVACY_NOTICE_URL':origin+'/privacy/','CHECKIN_PRIVACY_NOTICE_VERSION':'synthetic-local',
      'CHECKIN_DEMO_MODE':'False','ALLOWED_HOSTS':'localhost,127.0.0.1','CSRF_TRUSTED_ORIGINS':origin,
      'CORS_ALLOWED_ORIGINS':'','TRUST_PROXY_HTTPS':'True','DB_SSLMODE':'verify-full','DB_SSLROOTCERT':'/run/ca.crt',
      'HEALTHCHECK_HOST':'localhost','PGSSLMODE':'verify-full','PGSSLROOTCERT':'/run/ca.crt','PORT':'8000'}
owner_env=envfile('migrator.env',{**base,'DJANGO_ENV':'ci','DJANGO_SETTINGS_MODULE':'config.settings.ci',
    'DATABASE_URL':'postgresql://postgres:'+quote(password)+'@staging-db:5432/'+DB+'?sslmode=verify-full&sslrootcert=/run/ca.crt',
    'ALLOW_SYNTHETIC_BOOTSTRAP':'True','SYNTHETIC_ADMIN_PASSWORD':admin_password,'SYNTHETIC_TOTP_SECRET':totp_secret})
runtime_env=envfile('runtime.env',{**base,'DJANGO_ENV':'staging','DJANGO_SETTINGS_MODULE':'config.settings.staging',
    'DATABASE_URL':'postgresql://beauty_runtime:'+quote(runtime_password)+'@staging-db:5432/'+DB,'ALLOW_MAINTENANCE_JOBS':'True'})
success=False
try:
    docker('network','create',LAB)
    docker('volume','create',resources['data_volume'])
    docker('volume','create',resources['tls_volume'])
    docker('run','--rm','--entrypoint','bash','-v',resources['tls_volume']+':/tls','-v',str(PRIVATE)+':/source:ro',PG_IMAGE,'-c',
           'cp /source/server.crt /source/server.key /tls/ && chown postgres:postgres /tls/server.* && chmod 600 /tls/server.key')
    docker('run','-d','--name',resources['database'],'--label','beauty.phase8.synthetic=true','--network',LAB,'--network-alias','staging-db',
        '--env-file',str(owner),'-v',resources['data_volume']+':/var/lib/postgresql','-v',resources['tls_volume']+':/tls:ro',PG_IMAGE,
        '-c','ssl=on','-c','ssl_cert_file=/tls/server.crt','-c','ssl_key_file=/tls/server.key')
    for attempt in range(45):
        ready=subprocess.run(['docker','exec',resources['database'],'pg_isready','-U','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        if ready.returncode==0:break
        time.sleep(1)
    else:raise RuntimeError('Synthetic PostgreSQL did not start.')
    public_ca=ROOT/('backups/'+LAB+'-ca.crt')
    public_ca.write_bytes((PRIVATE/'ca.crt').read_bytes())
    public_ca.chmod(0o644)
    mount=['-v',str(public_ca)+':/run/ca.crt:ro']
    docker('run','--rm','--network',LAB,'--env-file',str(owner_env),*mount,IMAGE,'python','deployment/bootstrap_synthetic.py')
    role_sql=(ROOT/'deployment/roles.sql').read_text()
    # Generated secrets are passed over stdin to a private synthetic container, never command lines or logs.
    role_input=("CREATE ROLE beauty_runtime LOGIN PASSWORD '"+runtime_password+"';\nCREATE ROLE beauty_backup NOLOGIN;\n"+role_sql).encode()
    docker('exec','-i',resources['database'],'psql','-v','ON_ERROR_STOP=1','-U','postgres','-d',DB,input=role_input)
    docker('run','-d','--name',resources['web'],'--label','beauty.phase8.synthetic=true','--network',LAB,'--env-file',str(runtime_env),*mount,
        '-p','127.0.0.1::8000',IMAGE)
    upstream[0]=int(docker('port',resources['web'],'8000/tcp',capture=True).split(':')[-1])
    thread=threading.Thread(target=proxy.serve_forever,daemon=True)
    thread.start()
    jar=http.cookiejar.CookieJar()
    opener=build_opener(HTTPSHandler(context=ssl.create_default_context(cafile=str(PRIVATE/'ca.crt'))),HTTPCookieProcessor(jar))
    def request(path,payload=None):
        headers={'Content-Type':'application/json','Origin':origin}
        for cookie in jar:
            if cookie.name=='csrftoken':headers['X-CSRFToken']=cookie.value
        req=Request(origin+path,data=json.dumps(payload).encode() if payload is not None else None,headers=headers)
        try:
            with opener.open(req,timeout=10) as response:
                content=response.read()
                return response.status,json.loads(content) if content else None,dict(response.headers)
        except HTTPError as error:return error.code,json.loads(error.read()),dict(error.headers)
    for attempt in range(45):
        try:
            if request('/health/ready')[0]==200:break
        except Exception:pass
        time.sleep(1)
    else:raise RuntimeError('Synthetic staging readiness failed.')
    assert request('/api/clientas/')[0]==403
    assert request('/api/auth/csrf/')[0]==200
    assert request('/api/auth/login/',{'username':'staging_operator','password':admin_password})[0]==202
    assert request('/api/clientas/')[0]==403
    token=TOTP(bytes.fromhex(totp_secret))
    assert request('/api/auth/mfa/verify/',{'code':str(token.token()).zfill(6)})[0]==200
    assert request('/api/clientas/')[0]==200
    assert request('/api/v1/analytics/overview/?desde=2026-10-01&hasta=2026-11-01')[0]==200
    assert request('/api/v1/agenda/citas/')[0]==200
    assert all(cookie.secure for cookie in jar)
    assert request('/api/auth/logout/',{})[0]==204
    assert request('/api/clientas/')[0]==403
    report={'local_only':True,'synthetic_database':True,'postgres_tls':'verify-full','runtime_non_root':True,
        'readiness':200,'https_mfa_login':True,'secure_cookies':True,'csrf':True,'least_privilege_runtime':True,
        'web_container':resources['web'],'db_container':resources['database'],'network':LAB,
        'ephemeral_https_proxy_stopped':True,'production_deployed':False}
    (ROOT/'backups/phase8-docker-smoke.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    success=True
    print(json.dumps({key:value for key,value in report.items() if not key.endswith('container')}))
finally:
    proxy.shutdown() if 'thread' in locals() else None
    proxy.server_close()
    log.close()
    # Containers intentionally remain LOCAL for inspecting sanitized logs; they contain only synthetic records.
    (ROOT/'backups/phase8-lab-resources.json').write_text(json.dumps({**resources,'synthetic':True,'success':success},indent=2),encoding='utf-8')
