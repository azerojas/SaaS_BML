"""Read-only authenticated API smoke after permission activation; never creates/expires bookings."""
import os
import sys
from datetime import timedelta
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.db import connection
from django.urls import resolve
from django.utils import timezone
from rest_framework.test import APIRequestFactory,force_authenticate
from apps.agenda.infrastructure.transactions import ensure_ready

ensure_ready()
assert Permission.objects.filter(content_type__app_label='agenda').count()==10
user=get_user_model().objects.filter(is_superuser=True,is_staff=True,is_active=True).first()
assert user
for resource in ['profesionales/','horarios/','bloqueos/','citas/','lista-espera/','calendario/','calendario/configuracion/']:
    path='/api/v1/agenda/'+resource
    match=resolve(path)
    today=timezone.localdate()
    params={'desde':today.isoformat(),'hasta':(today+timedelta(days=1)).isoformat()} if resource=='calendario/' else {}
    request=APIRequestFactory().get(path,params)
    force_authenticate(request,user=user)
    response=match.func(request,**match.kwargs)
    assert response.status_code==200,(resource,response.status_code)
    print(resource+': authenticated read-only HTTP 200')
with connection.cursor() as cursor:
    cursor.execute("SELECT relkind,count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','v') GROUP BY relkind")
    assert dict(cursor.fetchall())=={'r':47,'v':7}
print('Verified 47 tables and 7 views; no appointments, retirements or expiry executed.')
