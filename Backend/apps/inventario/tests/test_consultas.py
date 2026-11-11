from datetime import timedelta
from unittest.mock import patch
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from negocio import models as m
from .base import API, InventoryTestCase


class QueryTests(InventoryTestCase):
    def test_supplier_validation_and_soft_deactivation(self):
        provider=self.provider(nombre='  Proveedor  prueba ',ruc='RUC-FICTICIO',telefono='999123456',email='prueba@example.com')
        self.assertEqual(provider['nombre'],'Proveedor prueba')
        self.assertEqual(provider['telefono'],'+51999123456')
        self.provider(ruc='RUC-FICTICIO')
        for field,value in [('nombre',' '),('email','bad'),('telefono','bad')]:
            self.assertEqual(self.client.post(API+'proveedores/',{'nombre':'Prueba',field:value},format='json').status_code,400)
        purchase=self.purchase(proveedor_id=provider['id'])
        path=API+'proveedores/'+str(provider['id'])+'/'
        self.assertEqual(self.client.patch(path,{'nombre':'Editado'},format='json').status_code,200)
        for _ in range(2):self.assertEqual(self.client.post(path+'desactivar/').status_code,200)
        self.assertEqual(m.Compras.objects.get(pk=purchase['id']).proveedor_id,provider['id'])
        self.assertEqual(self.client.get(API+'proveedores/',{'activo':'false'}).json()['count'],1)
        self.assertEqual(self.client.delete(path).status_code,405)
        self.assertEqual(self.client.post(path+'reactivar/').status_code,200)

    def test_stock_filters_no_movements_and_exact_view(self):
        a=self.article(stock_minimo='0')
        b=self.article(stock_minimo='3')
        self.adjustment(b,cantidad='2')
        empty=self.client.get(API+'inventario/stock/',{'sin_movimientos':'true'}).json()
        self.assertEqual([x['articulo_id'] for x in empty['results']],[a['id']])
        self.assertTrue(self.stock_row(a)['bajo_minimo'])
        for obj in [a,b]:
            row=self.stock_row(obj)
            view=m.VwStockActual.objects.get(pk=obj['id'])
            self.assertEqual(row['existencia'],format(view.existencia,'.3f'))
        alerts=self.client.get(API+'inventario/alertas/').json()
        self.assertEqual(alerts['count'],2)
        self.assertEqual(alerts['tipo_alerta'],'bajo_stock')
        self.assertEqual(self.client.get(API+'inventario/alertas/',{'tipo':'bajo_stock','tipo_articulo':'INSUMO'}).status_code,200)

    def test_weighted_recipe_cost_and_free_purchase(self):
        article=self.article()
        service=self.service()
        m.RecetasServicio.objects.create(servicio_id=service['id'],articulo_id=article['id'],cantidad_estimada='0.500')
        path=API+'inventario/costos-receta/'+str(service['id'])+'/'
        self.assertIsNone(self.client.get(path).json()['costo_estimado'])
        self.receive(self.purchase([self.line(article,cantidad='2',costo_unitario='3')]))
        self.receive(self.purchase([self.line(article,cantidad='1',costo_unitario='6')]))
        # Drafts, cancelled purchases and unvalued entries do not affect historical purchase cost.
        self.purchase([self.line(article,cantidad='100',costo_unitario='99')])
        self.adjustment(article,cantidad='10')
        data=self.client.get(path).json()
        self.assertEqual(data['costo_estimado'],'2.00')
        self.assertEqual(data['insumos'][0]['costo_unitario_estimado'],'4.0000')
        self.assertEqual(self.stock_row(article)['costo_unitario_estimado'],'4.0000')
        self.assertTrue(data['completo'])
        free=self.article()
        self.receive(self.purchase([self.line(free,costo_unitario='0')]))
        self.assertEqual(self.stock_row(free)['costo_unitario_estimado'],'0.0000')

    def test_incomplete_recipe_does_not_invent_cost(self):
        service=self.service()
        a=self.article()
        b=self.article()
        for article in [a,b]:
            m.RecetasServicio.objects.create(servicio_id=service['id'],articulo_id=article['id'],cantidad_estimada=1)
        self.receive(self.purchase([self.line(a)]))
        data=self.client.get(API+'inventario/costos-receta/'+str(service['id'])+'/').json()
        self.assertIsNone(data['costo_estimado'])
        self.assertFalse(data['completo'])
        self.assertIsNone(data['insumos'][1]['costo_unitario_estimado'])

    def test_expiry_alerts_only_received_and_never_claim_lot_stock(self):
        today=timezone.localdate()
        old=today-timedelta(days=20)
        expired=self.purchase([self.line(vencimiento=(today-timedelta(days=1)).isoformat(),numero_lote='FICTICIO-VENCIDO')])
        with patch('apps.inventario.services.timezone.localdate',return_value=old):
            self.assertEqual(self.receive(expired).status_code,200)
        future=self.purchase([self.line(vencimiento=(today+timedelta(days=10)).isoformat(),numero_lote='FICTICIO-PROXIMO')])
        self.receive(future)
        self.purchase([self.line(vencimiento=(today+timedelta(days=1)).isoformat())])
        cancelled=self.purchase([self.line(vencimiento=today.isoformat())])
        self.client.post(API+'compras/'+str(cancelled['id'])+'/anular/')
        data=self.client.get(API+'inventario/alertas/',{'tipo':'vencimiento'}).json()
        self.assertEqual(data['count'],2)
        self.assertIn('no confirma',data['advertencia'])
        self.assertEqual({row['estado_alerta'] for row in data['results']},{'VENCIDO','PROXIMO'})
        self.assertTrue(all(row['existencia_lote'] is None for row in data['results']))
        self.assertEqual(self.client.get(API+'inventario/alertas/',{'tipo':'vencimiento','estado':'vencido'}).json()['count'],1)

    def test_purchase_and_ledger_filters_dates_order_and_pagination(self):
        provider=self.provider()
        a=self.article(nombre='Sérum')
        purchase=self.purchase([self.line(a)],proveedor_id=provider['id'],numero_documento='DOC-FICTICIO')
        self.receive(purchase)
        self.adjustment(a,cantidad='3')
        day=timezone.localdate().isoformat()
        for params in [{'proveedor':provider['id']},{'search':'DOC-FICTICIO'},{'estado':'RECIBIDA'},{'desde':day,'hasta':day}]:
            self.assertEqual(self.client.get(API+'compras/',params).json()['count'],1)
        for params in [{'articulo':a['id']},{'search':'serum'},{'desde':day,'hasta':day}]:
            self.assertEqual(self.client.get(API+'inventario/movimientos/',params).json()['count'],2)
        self.assertEqual(self.client.get(API+'inventario/movimientos/',{'compra':purchase['id']}).json()['count'],1)
        r=self.client.get(API+'inventario/movimientos/',{'page_size':1}).json()
        self.assertEqual(r['count'],2)
        self.assertIsNotNone(r['next'])
        self.assertEqual(r['results'][0]['motivo'],'COMPRA')
        for resource,params in [('compras',{'desde':'bad'}),('compras',{'desde':'2026-02-30'}),
                                ('compras',{'desde':'2026-11-10','hasta':'2026-11-01'}),
                                ('compras',{'estado':'OTRO'}),('inventario/stock',{'activo':'bad'}),
                                ('inventario/movimientos',{'motivo':'OTRO'}),
                                ('inventario/alertas',{'tipo':'OTRO'}),
                                ('inventario/alertas',{'tipo':'vencimiento','dias':366})]:
            self.assertEqual(self.client.get(API+resource+'/',params).status_code,400)

    def test_list_query_budget_and_existing_catalog_compatibility(self):
        for i in range(21):
            article=self.article(nombre='Insumo '+str(i).zfill(2))
            self.receive(self.purchase([self.line(article)]))
        with CaptureQueriesContext(connection) as queries:
            r=self.client.get(API+'inventario/stock/',{'page_size':20})
            self.assertEqual(len(r.json()['results']),20)
        self.assertLessEqual(len(queries),3)
        with CaptureQueriesContext(connection) as queries:
            r=self.client.get(API+'compras/',{'page_size':20})
            self.assertEqual(len(r.json()['results']),20)
        self.assertLessEqual(len(queries),3)
        self.assertEqual(self.client.get('/api/admin/catalogo/stock/').json()['count'],21)

    def test_isolated_end_to_end_demonstration(self):
        provider=self.provider(nombre='Proveedor demostracion')
        article=self.article(nombre='Insumo demostracion',stock_minimo='2')
        draft=self.purchase([self.line(article,cantidad='5',costo_unitario='1.2500')],proveedor_id=provider['id'])
        received=self.receive(draft)
        self.assertEqual(received.status_code,200)
        self.assertEqual(self.stock_row(article)['existencia'],'5.000')
        self.assertEqual(self.adjustment(article,tipo='AJUSTE_SALIDA',cantidad='4').status_code,201)
        self.assertEqual(self.stock_row(article)['existencia'],'1.000')
        alerts=self.client.get(API+'inventario/alertas/').json()
        self.assertEqual(alerts['count'],1)
        self.assertEqual(m.MovimientosInventario.objects.count(),2)

