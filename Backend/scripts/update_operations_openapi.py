"""Add Phase 8 contracts without regenerating or dropping earlier phase paths."""
import json
from pathlib import Path
path=Path(__file__).resolve().parents[1]/'docs/openapi.json'
doc=json.loads(path.read_text(encoding='utf-8'))
for route,label in [('/health/live','Process liveness, no database'),('/health/ready','Database, constraints and migration readiness')]:
    doc['paths'][route]={'get':{'operationId':route.replace('/','_'),'summary':label,'security':[],
        'responses':{'200':{'description':'Healthy'},'503':{'description':'Not ready (readiness only)'}}}}
doc['paths']['/api/auth/mfa/verify/']={'post':{'operationId':'auth_mfa_verify','summary':'Complete password challenge with TOTP/recovery code',
    'description':'Session cookie from login 202 plus CSRF cookie/header required; expires after 5 minutes. No user enrollment over public API.',
    'requestBody':{'required':True,'content':{'application/json':{'schema':{'type':'object','additionalProperties':False,
        'required':['code'],'properties':{'code':{'type':'string','minLength':6,'maxLength':128}}}}}},
    'responses':{str(code):{'description':label} for code,label in [(200,'Authenticated; cookies rotated'),(400,'Invalid input'),(401,'Invalid/expired challenge or code'),(403,'CSRF forbidden'),(429,'Rate limited'),(503,'MFA configuration unavailable')]}}}
doc['paths']['/api/v1/operations/status/']={'get':{'operationId':'operations_status','summary':'Private job heartbeats and stale alerts',
    'description':'Active staff plus operaciones.view_operations; session authentication and MFA when required.',
    'responses':{str(code):{'description':label} for code,label in [(200,'Job metadata; no personal data'),(403,'Forbidden'),(503,'Migrations/database unavailable')]}}}
login=doc['paths'].get('/api/auth/login/',{}).get('post')
if login:
    login.setdefault('responses',{})['202']={'description':'Password accepted; MFA required. Use /api/auth/mfa/verify/.'}
    login['description']=login.get('description','')+' Production requires MFA; password-only login never grants private access.'
doc['info']['version']='8.0.0'
path.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('OpenAPI paths:',len(doc['paths']))
