"""Read-only post-activation checks. No fixtures, sessions, sales or payments created."""
import argparse
import json
import os
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()
from django.db import connection
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from rest_framework.test import APIRequestFactory,force_authenticate
from apps.finanzas.infrastructure.schema import ensure_ready
from apps.finanzas.presentation.views import VisitViewSet,SaleViewSet,PaymentViewSet,AdvanceViewSet

parser=argparse.ArgumentParser()
parser.add_argument('--compare-preactivation-business-rows',action='store_true')
args=parser.parse_args()
ensure_ready()
with connection.cursor() as cursor:
    cursor.execute("SELECT relkind,count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','v') GROUP BY relkind")
    counts=dict(cursor.fetchall())
assert counts=={'r':47,'v':7},counts
print('Schema verified: 47 tables, 7 views.')
permissions=['view_finance','manage_visits','manage_sales','confirm_sale','register_payment',
             'void_payment','manage_advances','apply_advance','override_price']
assert Permission.objects.filter(content_type__app_label='finanzas',codename__in=permissions).count()==9
print('All 9 finance action permissions registered.')
user=get_user_model().objects.filter(is_active=True,is_staff=True,is_superuser=True).first()
assert user,'No active superuser available for read-only authenticated endpoint checks.'
for cls,action,path in [(VisitViewSet,'list','visitas'),(SaleViewSet,'list','ventas'),
    (SaleViewSet,'profesionales','ventas/profesionales'),(PaymentViewSet,'list','pagos'),
    (AdvanceViewSet,'list','anticipos')]:
    request=APIRequestFactory().get('/api/'+path+'/')
    force_authenticate(request,user=user)
    response=cls.as_view({'get':action})(request)
    assert response.status_code==200,(path,response.status_code)
    print(path+': authenticated application dispatch HTTP 200; count='+str(response.data['count']))
if args.compare_preactivation_business_rows:
    baseline=json.loads((ROOT/'backups/phase5-baseline.json').read_text(encoding='utf-8'))['business_data']
    with connection.cursor() as cursor:
        for table,expected in baseline.items():
            cursor.execute("SELECT count(*),md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY row_to_json(t)::text),'')) FROM "+connection.ops.quote_name(table)+' t')
            assert list(cursor.fetchone())==expected,table
    print('All 34 original business tables retain their pre-activation rows.')
print('Read-only activation verification passed; no business operations created.')
