from datetime import datetime
from django.apps import apps
from django.db import connection
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient
from apps.finanzas.tests.base import FinanceTestCase
from apps.reporting.domain.periods import ZONE
from negocio import models as m

BASE='/api/v1/analytics/'
RANGE='?desde=2026-10-01&hasta=2026-11-01'


class ReportTestCase(TransactionTestCase):
    # Reuse the Phase-5 public API fixtures, while allowing real independent read-only transactions.
    product=FinanceTestCase.product
    service=FinanceTestCase.service
    product_line=FinanceTestCase.product_line
    service_line=FinanceTestCase.service_line
    visit=FinanceTestCase.visit
    sale=FinanceTestCase.sale
    detail=FinanceTestCase.detail
    mutate=FinanceTestCase.mutate
    confirm=FinanceTestCase.confirm
    pay=FinanceTestCase.pay

    def setUp(self):
        FinanceTestCase.setUpTestData.__func__(type(self))
        FinanceTestCase.setUp(self)

    def _fixture_teardown(self):
        # Django's managed-only flush cannot safely clear a legacy schema with user FKs.
        # Exact test target checked before truncating its business/user rows; permissions/migrations retained.
        assert connection.settings_dict['NAME'].startswith('test_lasheo_phase1_')
        tables={model._meta.db_table for model in apps.get_app_config('negocio').get_models() if not model._meta.db_table.startswith('vw_')}
        tables|={'aplicaciones_anticipo','idempotency_records','auth_user','autenticacion_loginattempt','django_session'}
        with connection.cursor() as cursor:
            cursor.execute('TRUNCATE '+','.join(connection.ops.quote_name(table) for table in sorted(tables))+' RESTART IDENTITY CASCADE')

    def dated_sale(self, day='2026-10-15', payment=None, service=False, **changes):
        item=self.service() if service else self.product()
        visit=self.visit() if service else None
        sale=self.sale([self.service_line(item) if service else self.product_line(item)],visit,**changes)
        groups=[{'detalle_id':self.detail(sale)['lineas'][0]['id'],'insumos':[]}] if service else []
        self.assertEqual(self.confirm(sale,groups).status_code,200)
        instant=datetime.fromisoformat(day+'T12:00:00').replace(tzinfo=ZONE)
        m.Ventas.objects.filter(pk=sale).update(confirmada_en=instant)
        if visit:m.Visitas.objects.filter(pk=visit).update(inicio_en=instant,fin_en=instant)
        if payment:
            response=self.pay(sale,payment)
            self.assertEqual(response.status_code,201)
            m.Pagos.objects.filter(pk=response.json()['pago_id']).update(pagado_en=instant)
        return sale,item

    def get_report(self, report='overview', query=RANGE, status=200):
        response=self.client.get(BASE+report+'/'+query)
        self.assertEqual(response.status_code,status,getattr(response,'data',response.content))
        return response.json()
