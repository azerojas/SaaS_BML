from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from decimal import Decimal as D
from time import perf_counter
from unittest.mock import patch
import json
from django.db import connection,connections,DatabaseError
from django.db.migrations.executor import MigrationExecutor
from django.test.utils import CaptureQueriesContext
from django.conf import settings
from negocio import models as m
from apps.reporting.domain.periods import ZONE,ReportFilter
from apps.reporting.infrastructure.snapshot import read_snapshot
from apps.reporting.application import services
from .base import ReportTestCase,BASE,RANGE


class IntegrityTests(ReportTestCase):
    def test_database_rejects_writes_inside_snapshot(self):
        with self.assertRaises(DatabaseError) as error:
            with read_snapshot():m.Clientas.objects.filter(pk=self.person.pk).update(nombres='No persistir')
        self.assertEqual(error.exception.__cause__.sqlstate,'25006')
        self.person.refresh_from_db()
        self.assertEqual(self.person.nombres,'Daniela')

    def test_repeatable_snapshot_during_concurrent_write(self):
        def create_sale():
            try:return m.Ventas.objects.create(estado='CONFIRMADA',confirmada_en=datetime(2026,10,15,tzinfo=ZONE)).pk
            finally:connections['default'].close()
        with read_snapshot():
            initial=m.Ventas.objects.count()
            with ThreadPoolExecutor(max_workers=1) as executor:executor.submit(create_sale).result(timeout=10)
            self.assertEqual(m.Ventas.objects.count(),initial)
        self.assertEqual(m.Ventas.objects.count(),initial+1)

    def test_proxy_permission_migration_preserves_tables_and_views(self):
        with connection.cursor() as cursor:
            cursor.execute("SELECT relname,relkind FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','v') ORDER BY 1")
            before=cursor.fetchall()
        MigrationExecutor(connection).migrate([('reporting',None)])
        self.get_report(status=503)
        MigrationExecutor(connection).migrate([('reporting','0001_report_permissions')])
        with connection.cursor() as cursor:
            cursor.execute("SELECT relname,relkind FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','v') ORDER BY 1")
            self.assertEqual(before,cursor.fetchall())

    def test_bounded_cohort_returns_error_not_truncated_totals(self):
        self.dated_sale()
        with patch('apps.reporting.infrastructure.repositories.MAX_SALES',0):self.get_report(status=422)

    def test_postgresql_timeout_returns_controlled_error_and_connection_recovers(self):
        def delayed(filters):
            with connection.cursor() as cursor:
                cursor.execute("SET LOCAL statement_timeout = '1ms'")
                cursor.execute('SELECT pg_sleep(0.02)')
        with patch('apps.reporting.infrastructure.repositories.ledger',side_effect=delayed):
            result=self.get_report(status=422)
        self.assertEqual(result['code'],'reporte_tiempo_excedido')
        self.get_report()

    def test_current_month_comparison_same_elapsed_days_and_leap_birthdays(self):
        with patch('apps.reporting.presentation.serializers.timezone.localdate',return_value=date(2026,11,6)):
            result=self.get_report('month-comparison','?month=2026-11')
        self.assertTrue(result['parcial_mismo_dia'])
        self.assertEqual(result['actual']['periodo']['hasta'],'2026-11-07')
        self.assertEqual(result['anterior']['periodo']['hasta'],'2026-10-07')
        m.Clientas.objects.filter(pk=self.person.pk).update(fecha_nacimiento=date(2000,2,29))
        with patch('apps.reporting.application.services.timezone.localdate',return_value=date(2025,2,28)):
            self.assertEqual(self.get_report()['indicadores']['cumpleanios_proximos'],1)

    def test_negative_margin_and_free_verified_zero_cost(self):
        sale,_=self.dated_sale()
        m.DetallesVenta.objects.filter(venta_id=sale).update(precio_unitario=D('1'))
        m.Ventas.objects.filter(pk=sale).update(subtotal=D('1'),total=D('1'))
        result=self.get_report()['indicadores']
        self.assertEqual(result['utilidad_estimada'],'-2.00')
        self.assertEqual(result['costo_directo'],'3.00')

    def test_queries_and_explain_with_1000_sales_have_no_n_plus_one(self):
        article=self.product(stock='2000')
        when=datetime(2026,10,15,tzinfo=ZONE)
        sales=m.Ventas.objects.bulk_create([m.Ventas(estado='CONFIRMADA',confirmada_en=when if index<100 else when+timedelta(days=1),subtotal=D('20'),total=D('20')) for index in range(1000)])
        lines=m.DetallesVenta.objects.bulk_create([m.DetallesVenta(venta=sale,tipo='PRODUCTO',articulo=article,cantidad=D('1'),descripcion_snapshot='Producto de prueba',precio_unitario=D('20'),costo_unitario_snapshot=D('3')) for sale in sales])
        m.MovimientosInventario.objects.bulk_create([m.MovimientosInventario(articulo=article,detalle_venta=line,motivo='VENTA_PRODUCTO',cantidad_firmada=D('-1'),costo_unitario=D('3')) for line in lines])
        filters=ReportFilter(date(2026,10,1),date(2026,11,1))
        with CaptureQueriesContext(connection) as small_queries:services.execute('overview',ReportFilter(date(2026,10,15),date(2026,10,16)))
        start=perf_counter()
        with CaptureQueriesContext(connection) as queries:result=services.execute('overview',filters)
        elapsed=perf_counter()-start
        self.assertEqual(result['indicadores']['ventas_confirmadas'],D('20000.00'))
        self.assertEqual(result['indicadores']['costo_directo'],D('3000.00'))
        self.assertLessEqual(len(queries),35)
        self.assertEqual(len(small_queries),len(queries))
        with read_snapshot():
            plan=m.Ventas.objects.filter(estado='CONFIRMADA',confirmada_en__gte=filters.start,confirmada_en__lt=filters.end).explain(analyze=True,buffers=True,format='json')
        evidence={'sales':1000,'lines':1000,'queries':len(queries),'small_cohort_sales':100,'small_cohort_queries':len(small_queries),'elapsed_seconds':round(elapsed,6),'postgres_explain':json.loads(plan)}
        (settings.BASE_DIR/'backups/phase6-performance.json').write_text(json.dumps(evidence,indent=2),encoding='utf-8')
        print('Phase6 performance: 1000 sales / 1000 lines;',len(queries),'queries;',round(elapsed,3),'seconds.')
