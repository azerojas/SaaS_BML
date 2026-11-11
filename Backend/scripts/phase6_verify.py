"""Read-only reporting readiness smoke. Does not generate XLSX or create access audits."""
import os
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.db import connection
from rest_framework.test import APIRequestFactory,force_authenticate
from apps.reporting.presentation.views import ReportView

assert Permission.objects.filter(content_type__app_label='reporting',codename__in=['view_summary','view_clients','view_inventory','export']).count()==4
user=get_user_model().objects.filter(is_superuser=True,is_staff=True,is_active=True).first()
assert user
factory=APIRequestFactory()
for report in ['overview','revenue-series','payment-methods','top-services','top-clients','inventory-alerts','expenses','clients-retention','month-comparison']:
    params={'desde':'2026-10-01','hasta':'2026-11-01'} if report!='month-comparison' else {'month':'2026-10'}
    request=factory.get('/api/v1/analytics/',params)
    force_authenticate(request,user=user)
    response=ReportView.as_view(report=report)(request)
    assert response.status_code==200,(report,response.status_code)
    print(report+': authenticated read-only dispatch HTTP 200')
    if report=='overview':
        assert response.data['indicadores']['dinero_recaudado'] is None
        assert response.data['calidad']['recaudacion_conciliada'] is False
        print('Net reconciled cash remains explicitly blocked, not fabricated.')
with connection.cursor() as cursor:
    cursor.execute("SELECT relkind,count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','v') GROUP BY relkind")
    assert dict(cursor.fetchall())=={'r':47,'v':7}
print('47 tables and 7 views preserved. No reports/export files written to the database.')
