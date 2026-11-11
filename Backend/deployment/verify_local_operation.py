"""Actual loopback HTTPS/session/MFA and least-privilege checks, no business mutations."""
from http.cookiejar import CookieJar
import json
from pathlib import Path
import ssl
import sys
from urllib.parse import urlsplit,parse_qs
from urllib.request import build_opener,HTTPSHandler,HTTPCookieProcessor,Request
from urllib.error import HTTPError
import base64
from django_otp.oath import TOTP
import psycopg
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'deployment'))
from local_certificates import private_write
PRIVATE=Path.home()/'.codex/lasheo-private/local-operation'
credentials=json.loads((PRIVATE/'credentials.json').read_text())
url=credentials['url']
jar=CookieJar()
ctx=ssl.create_default_context(cafile=str(PRIVATE/'certificates/ca.crt'))
opener=build_opener(HTTPSHandler(context=ctx),HTTPCookieProcessor(jar))
def request(path,body=None,csrf=True):
    headers={}
    if body is not None:
        headers={'Content-Type':'application/json','Origin':url,'Referer':url+'/'}
        if csrf:headers['X-CSRFToken']=next((cookie.value for cookie in jar if cookie.name=='csrftoken'),'')
    req=Request(url+path,data=json.dumps(body).encode() if body is not None else None,headers=headers)
    try:
        with opener.open(req,timeout=10) as response:
            data=response.read();return response.status,json.loads(data) if data else None
    except HTTPError as error:
        data=error.read()
        try:body=json.loads(data)
        except ValueError:body={}
        return error.code,body
assert request('/health/ready')[0]==200
assert request('/api/clientas/')[0]==403
body={'username':credentials['username'],'password':credentials['password']}
assert request('/api/auth/login/',body,csrf=False)[0]==403
assert request('/api/auth/csrf/')[0]==200
assert request('/api/auth/login/',body)[0]==202
assert request('/api/clientas/')[0]==403
uri=(PRIVATE/'operator.otpauth').read_text().strip()
secret=parse_qs(urlsplit(uri).query)['secret'][0]
token=TOTP(base64.b32decode(secret))
status,response=request('/api/auth/mfa/verify/',{'code':str(token.token()).zfill(6)})
assert status==200,status
if response.get('recovery_codes'):
    private_write(PRIVATE/'operator-recovery-codes.json',json.dumps(response['recovery_codes']).encode())
checks=[]
for path in ['/api/clientas/','/api/v1/agenda/citas/','/api/v1/operations/status/','/api/reembolsos/','/api/conciliaciones/']:
    status,_=request(path);assert status==200,(path,status);checks.append({'path':path,'status':status})
session=next(cookie for cookie in jar if cookie.name=='sessionid')
assert session.secure and 'HttpOnly' in session._rest
assert request('/api/auth/logout/',{})[0]==204
assert request('/api/clientas/')[0]==403
env=dict(line.split('=',1) for line in (PRIVATE/'runtime-windows.env').read_text().splitlines() if '=' in line)
denied=0
with psycopg.connect(env['DATABASE_URL'],sslmode='verify-full',sslrootcert=env['DB_SSLROOTCERT'],autocommit=True) as conn:
    for statement in ['CREATE TABLE forbidden_probe(id integer)','UPDATE auth_permission SET name=name WHERE false','UPDATE finanzas_reembolso SET monto=monto WHERE false','TRUNCATE clientas']:
        try:
            with conn.transaction():
                conn.execute(statement)
                raise AssertionError('Unexpected permission; transaction rolled back.')
        except psycopg.DatabaseError as error:
            assert error.sqlstate=='42501',error.sqlstate
            denied+=1
try:
    psycopg.connect(env['DATABASE_URL'],sslmode='disable',connect_timeout=5)
except psycopg.OperationalError:plain_denied=True
else:raise AssertionError('Plaintext database connection was accepted.')
report={'verified':True,'url':url,'https_ca_verified':True,'mfa_required':True,'csrf_verified':True,'secure_httponly_session':True,
    'private_routes':checks,'forbidden_sql_statements_denied':denied,'plaintext_db_rejected':plain_denied,
    'business_mutations_executed':False,'recovery_codes_delivered_to_private_file':(PRIVATE/'operator-recovery-codes.json').exists()}
(ROOT/'backups/six-controls-local-security.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
