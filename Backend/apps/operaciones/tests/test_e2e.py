from datetime import timedelta
from decimal import Decimal
import uuid
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from negocio import models as m
from apps.inventario.services import balance
from apps.reporting.tests.base import ReportTestCase


@override_settings(CHECKIN_DEMO_MODE=False,PUBLIC_CHECKIN_URL='https://app.example.test/checkin/',
    CHECKIN_PRIVACY_NOTICE_URL='https://app.example.test/privacy/',CHECKIN_PRIVACY_NOTICE_VERSION='e2e-synthetic')
class EndToEndTests(ReportTestCase):
    def test_qr_human_confirmation_visit_actual_consumption_sale_partial_payment_dashboard(self):
        point=self.client.post('/api/admin/checkin/puntos/',{'nombre':'Local sintético'},format='json')
        self.assertEqual(point.status_code,201,point.data)
        qr=m.PuntosQr.objects.get(pk=point.json()['id'])
        anonymous=APIClient(enforce_csrf_checks=True)
        response=anonymous.post('/api/public/checkin/'+str(qr.token)+'/',{'telefono':self.person.telefono,
            'nombres':'Daniela','apellidos':'Ficticia','consentimiento_datos':True,'version_aviso':'e2e-synthetic'},format='json')
        self.assertEqual(response.status_code,202,response.data)
        arrival=m.Llegadas.objects.get()
        prefix='/api/admin/checkin/llegadas/'+str(arrival.pk)+'/'
        self.assertEqual(self.client.post(prefix+'confirmar/',{'identidad_verificada':True,'consentimiento_verificado':True},format='json').status_code,200)
        visit=self.client.post(prefix+'crear-visita/',{},format='json').json()['id']
        product=self.product()
        supply=self.product(kind='INSUMO',cost='2.0000')
        service=self.service()
        sale=self.sale([self.service_line(service),self.product_line(product)],visit)
        line=next(row for row in self.detail(sale)['lineas'] if row['tipo']=='SERVICIO')
        groups=[{'detalle_id':line['id'],'insumos':[{'articulo_id':supply.pk,'unidad_id':self.unit.pk,'cantidad':'0.500'}]}]
        key=str(uuid.uuid4())
        self.assertEqual(self.confirm(sale,groups,key).status_code,200)
        self.assertEqual(self.confirm(sale,groups,key).status_code,200)
        key=str(uuid.uuid4())
        self.assertEqual(self.pay(sale,'40.00',key=key).status_code,201)
        self.assertEqual(self.pay(sale,'40.00',key=key).status_code,201)
        self.assertEqual(self.detail(sale)['saldo']['saldo_pendiente'],'60.00')
        self.assertEqual(self.pay(sale,'60.00').status_code,201)
        self.assertEqual(self.detail(sale)['saldo']['saldo_pendiente'],'0.00')
        self.assertEqual(balance(product.pk),Decimal('9.000'))
        self.assertEqual(balance(supply.pk),Decimal('9.500'))
        self.assertEqual(m.ConsumosServicio.objects.count(),1)
        self.assertEqual(m.Pagos.objects.count(),2)
        today=timezone.localdate()
        result=self.get_report(query=f'?desde={today}&hasta={today+timedelta(days=1)}')['indicadores']
        for name,value in {'ventas_confirmadas':'100.00','cobros_registrados':'100.00','saldo_pendiente':'0.00','costo_directo':'4.00'}.items():
            self.assertEqual(result[name],value,name)
        self.assertIsNone(result['dinero_recaudado'])  # No invented reconciliation.

    def test_operations_migration_roundtrip_preserves_legacy_schema_and_rows(self):
        assert connection.settings_dict['NAME'].startswith('test_lasheo_phase1_')
        def signature():
            with connection.cursor() as cursor:
                cursor.execute("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name NOT LIKE 'operaciones_%' ORDER BY 1,ordinal_position")
                columns=cursor.fetchall()
                cursor.execute("SELECT viewname,definition FROM pg_views WHERE schemaname='public' ORDER BY 1")
                views=cursor.fetchall()
                cursor.execute('SELECT id,nombres,telefono FROM clientas ORDER BY id')
                return columns,views,cursor.fetchall()
        before=signature()
        MigrationExecutor(connection).migrate([('operaciones',None)])
        MigrationExecutor(connection).migrate([('operaciones','0001_security_and_job_state')])
        self.assertEqual(before,signature())
        with connection.cursor() as cursor:
            cursor.execute("SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'operaciones_%'")
            self.assertEqual(cursor.fetchone()[0],2)
