"""Read-only local activation smoke: no sessions, business writes, MFA enrollment or jobs."""
import json
import os
from pathlib import Path
import sys
from datetime import timedelta
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
sys.path.insert(0,str(ROOT/'scripts'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.db import connection
from django.urls import resolve
from django.utils import timezone
from rest_framework.test import APIRequestFactory,force_authenticate
from backup_common import fingerprint

assert settings.APP_ENV=='development'
assert not settings.MFA_REQUIRED and not settings.ALLOW_MAINTENANCE_JOBS
connection.ensure_connection()
before=fingerprint(connection.connection)
assert len(before['rows'])==49
user=get_user_model().objects.filter(is_superuser=True,is_staff=True,is_active=True).first()
assert user is not None
assert Permission.objects.filter(content_type__app_label='operaciones',codename='view_operations').exists()
checks=[]
factory=APIRequestFactory()
for path in ['/health/live','/health/ready','/api/v1/operations/status/','/api/clientas/',
             '/api/v1/agenda/citas/','/api/v1/analytics/overview/']:
    today=timezone.localdate()
    params={'desde':today.isoformat(),'hasta':(today+timedelta(days=1)).isoformat()} if path.endswith('overview/') else {}
    request=factory.get(path,params)
    if path.startswith('/api/'):force_authenticate(request,user=user)
    match=resolve(path)
    response=match.func(request,**match.kwargs)
    assert response.status_code==200,(path,response.status_code)
    checks.append({'method':'GET','path':path,'status':response.status_code})
path='/api/v1/operations/status/'
request=factory.get(path)
match=resolve(path)
response=match.func(request,**match.kwargs)
assert response.status_code==403
checks.append({'method':'GET','path':path,'anonymous':True,'status':403})
after=fingerprint(connection.connection)
assert before==after,'Read-only smoke unexpectedly changed stored data/schema.'
report={'verified':True,'physical_tables':49,'views':7,'all_rows_unchanged_during_smoke':True,'checks':checks,
        'mfa_required_local':settings.MFA_REQUIRED,'maintenance_jobs_enabled':settings.ALLOW_MAINTENANCE_JOBS,
        'business_operations_executed':False}
(ROOT/'backups/phase8-endpoint-verification.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
