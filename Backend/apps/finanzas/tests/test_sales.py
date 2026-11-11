import uuid
from decimal import Decimal
from unittest.mock import patch
from django.db import connection,IntegrityError,transaction
from negocio import models as m
from apps.finanzas.models import IdempotencyRecord
from apps.inventario import services as inventory
from .base import API,FinanceTestCase


class SaleTests(FinanceTestCase):
    def test_real_consumption_retry_and_unique_sources_cannot_discount_material_twice(self):
        supply=self.product(kind='INSUMO')
        service=self.service()
        sale=self.sale([self.service_line(service)],self.visit())
        line=self.detail(sale)['lineas'][0]
        groups=[{'detalle_id':line['id'],'insumos':[{'articulo_id':supply.pk,'unidad_id':self.unit.pk,'cantidad':'0.500'}]}]
        key=str(uuid.uuid4())
        self.assertEqual(self.confirm(sale,groups,key).status_code,200)
        self.assertEqual(self.confirm(sale,groups,key).status_code,200)
        self.assertEqual(self.confirm(sale,groups).status_code,409)
        self.assertEqual(m.ConsumosServicio.objects.count(),1)
        self.assertEqual(inventory.balance(supply.pk),Decimal('9.500'))
        source=m.MovimientosInventario.objects.get(motivo='CONSUMO_SERVICIO')
        with self.assertRaises(IntegrityError),transaction.atomic():
            m.MovimientosInventario.objects.create(articulo_id=supply.pk,motivo='CONSUMO_SERVICIO',cantidad_firmada=-1,consumo_servicio_id=source.consumo_servicio_id)

    def test_product_source_unique_index_remains_final_defense(self):
        product=self.product()
        sale=self.sale([self.product_line(product)])
        self.confirm(sale)
        source=m.MovimientosInventario.objects.get(motivo='VENTA_PRODUCTO')
        with self.assertRaises(IntegrityError),transaction.atomic():
            m.MovimientosInventario.objects.create(articulo_id=product.pk,motivo='VENTA_PRODUCTO',cantidad_firmada=-1,detalle_venta_id=source.detalle_venta_id)

    def test_cancelled_visit_cannot_have_sale_confirmed(self):
        visit=self.visit()
        product=self.product()
        sale=self.sale([self.product_line(product)],visit)
        from django.utils import timezone
        m.Visitas.objects.filter(pk=visit).update(estado='CANCELADA',fin_en=timezone.now())
        self.assertEqual(self.confirm(sale).status_code,409)
        self.assertEqual(inventory.balance(product.pk),10)

    def test_true_zero_acquisition_cost_and_free_sale_are_valid(self):
        product=self.product(price='0.00',cost='0.0000')
        sale=self.sale([self.product_line(product)])
        self.assertEqual(self.confirm(sale).status_code,200)
        self.assertEqual(self.detail(sale)['finanzas_congeladas']['costo_directo'],'0.00')
        self.assertEqual(self.pay(sale,'0.01').status_code,409)

    def test_products_service_actual_consumption_prices_commission_and_tip(self):
        visit=self.visit()
        product=self.product()
        supply=self.product(kind='INSUMO',price='0',cost='2.0000')
        service=self.service()
        m.RecetasServicio.objects.create(servicio_id=service.pk,articulo_id=supply.pk,cantidad_estimada=Decimal('.500'))
        with connection.cursor() as c:
            c.execute("INSERT INTO profesionales(nombres,apellidos,comision_porcentaje) VALUES ('Prueba','Profesional',10) RETURNING id")
            professional=c.fetchone()[0]
        sale=self.sale([self.service_line(service,descuento_linea='10.00',profesional_id=professional),
                        self.product_line(product,'2.000')],visit,descuento_global='10.00',propina='5.00')
        detail=self.detail(sale)
        self.assertEqual(detail['total'],'105.00')
        service_detail=next(row for row in detail['lineas'] if row['tipo']=='SERVICIO')
        preview=self.mutate('ventas/'+str(sale)+'/previsualizar/',expected=200).json()
        self.assertEqual(preview['receta_sugerida'][0]['insumos'][0]['cantidad'],'0.500')
        self.assertFalse(preview['afecta_stock'])
        groups=[{'detalle_id':service_detail['id'],'insumos':[{'articulo_id':supply.pk,'unidad_id':self.unit.pk,'cantidad':'0.300'}]}]
        self.assertEqual(self.confirm(sale,groups).status_code,200)
        detail=self.detail(sale)
        self.assertEqual(detail['finanzas_congeladas']['costo_directo'],'6.60')
        self.assertEqual(detail['finanzas_congeladas']['comisiones'],'6.36')
        self.assertEqual(detail['finanzas_congeladas']['margen_antes_gastos'],'87.04')
        self.assertEqual(inventory.balance(product.pk),8)
        self.assertEqual(inventory.balance(supply.pk),Decimal('9.700'))
        self.assertEqual(m.Visitas.objects.get(pk=visit).estado,'FINALIZADA')
        self.assertEqual(m.ConsumosServicio.objects.get().cantidad,Decimal('.300'))
        self.assertEqual(m.Pagos.objects.count(),0)

    def test_confirm_idempotency_and_immutable_after_confirmation(self):
        article=self.product()
        sale=self.sale([self.product_line(article)])
        key=str(uuid.uuid4())
        first=self.confirm(sale,key=key)
        self.assertEqual(first.status_code,200,first.data)
        second=self.confirm(sale,key=key)
        self.assertEqual(second.json(),first.json())
        self.assertEqual(m.MovimientosInventario.objects.filter(motivo='VENTA_PRODUCTO').count(),1)
        self.assertEqual(self.confirm(sale).status_code,409)
        self.assertEqual(self.mutate('ventas/'+str(sale)+'/',{'propina':'1'},method='patch').status_code,409)
        self.assertEqual(self.mutate('ventas/'+str(sale)+'/anular/',{'motivo':'No es devolucion'}).status_code,409)
        self.assertEqual(self.client.delete(API+'ventas/'+str(sale)+'/').status_code,405)

    def test_header_edits_preserve_line_snapshots_and_costs_stay_frozen(self):
        article=self.product()
        sale=self.sale([self.product_line(article)])
        m.Articulos.objects.filter(pk=article.pk).update(precio_venta=99,nombre='Renombrado')
        self.assertEqual(self.mutate('ventas/'+str(sale)+'/',{'propina':'2.00'},method='patch').status_code,200)
        self.assertEqual(self.detail(sale)['lineas'][0]['precio_unitario'],'20.00')
        self.assertEqual(self.confirm(sale).status_code,200)
        line=m.DetallesVenta.objects.get(venta_id=sale)
        self.assertEqual(line.costo_unitario_snapshot,3)
        purchase=inventory.save_purchase({'detalles':[{'articulo_id':article.pk,'unidad_id':self.unit.pk,'cantidad':Decimal('10'),'costo_unitario':Decimal('9')}]},self.admin)
        inventory.receive_purchase(purchase.pk,self.admin)
        self.assertEqual(self.detail(sale)['lineas'][0]['costo_unitario_snapshot'],'3.0000')
        self.assertEqual(self.detail(sale)['lineas'][0]['descripcion_snapshot'],'Articulo 1')

    def test_draft_replace_lines_discounts_and_server_fields(self):
        a=self.product()
        b=self.product()
        sale=self.sale([self.product_line(a)])
        response=self.mutate('ventas/'+str(sale)+'/',{'lineas':[self.product_line(b,'2.000')],'descuento_global':'5.00','propina':'1.00'},method='patch')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.json()['total'],'36.00')
        self.assertEqual(m.DetallesVenta.objects.filter(venta_id=sale).count(),1)
        for field in ['total','subtotal','estado','creada_por_id','confirmada_en']:
            self.assertEqual(self.mutate('ventas/',{field:'1'}).status_code,400)

    def test_line_invalid_inputs_and_price_override_permission(self):
        article=self.product()
        base=self.product_line(article)
        for field,value in [('cantidad','0'),('cantidad',1.5),('cantidad','1.0001'),('descuento_linea','21'),
                            ('unidad_id',self.other_unit.pk),('servicio_id',1),('costo_unitario_snapshot','1')]:
            self.assertEqual(self.mutate('ventas/',{'lineas':[{**base,field:value}]}).status_code,400)
        self.client.force_authenticate(self.cashier)
        self.assertEqual(self.mutate('ventas/',{'lineas':[{**base,'precio_unitario':'5.00','motivo_precio':'Promocion autorizada'}]}).status_code,403)
        self.client.force_authenticate(self.admin)
        sale=self.sale([{**base,'precio_unitario':'5.00','motivo_precio':'Promocion autorizada'}])
        self.assertEqual(self.detail(sale)['total'],'5.00')
        self.assertTrue(m.Auditoria.objects.filter(accion='PRECIO_EXCEPCION').exists())

    def test_service_requires_visit_and_actual_consumption_review(self):
        service=self.service()
        self.assertEqual(self.mutate('ventas/',{'lineas':[self.service_line(service)]}).status_code,400)
        sale=self.sale([self.service_line(service)],self.visit())
        line=self.detail(sale)['lineas'][0]
        self.assertEqual(self.confirm(sale).status_code,400)
        self.assertEqual(self.confirm(sale,[{'detalle_id':line['id'],'insumos':[]}],consumos_revisados=False).status_code,400)
        self.assertEqual(self.confirm(sale,[{'detalle_id':line['id'],'insumos':[]}]).status_code,200)
        self.assertEqual(m.ConsumosServicio.objects.count(),0)

    def test_stock_combines_product_and_service_supply_for_same_article(self):
        both=self.product(kind='AMBOS',stock='2')
        service=self.service()
        sale=self.sale([self.product_line(both,'2.000'),self.service_line(service)],self.visit())
        line=next(row for row in self.detail(sale)['lineas'] if row['tipo']=='SERVICIO')
        groups=[{'detalle_id':line['id'],'insumos':[{'articulo_id':both.pk,'unidad_id':self.unit.pk,'cantidad':'1.000'}]}]
        self.assertEqual(self.confirm(sale,groups).status_code,409)
        self.assertEqual(inventory.balance(both.pk),2)
        self.assertEqual(m.Ventas.objects.get(pk=sale).estado,'BORRADOR')
        self.assertEqual(m.ConsumosServicio.objects.count(),0)

    def test_unknown_cost_never_becomes_artificial_zero(self):
        article=self.product(stock=None)
        inventory.adjust_stock({'articulo_id':article.pk,'unidad_id':self.unit.pk,'tipo':'AJUSTE_ENTRADA',
            'cantidad':Decimal('5'),'justificacion':'Conteo ficticio inicial'},self.admin,str(uuid.uuid4()))
        sale=self.sale([self.product_line(article)])
        self.assertIsNone(self.mutate('ventas/'+str(sale)+'/previsualizar/',expected=200).json()['costo_directo_estimado'])
        self.assertEqual(self.confirm(sale).status_code,409)
        self.assertEqual(inventory.balance(article.pk),5)

    def test_mid_confirmation_failure_rolls_back_stock_sale_visit_and_idempotency(self):
        product=self.product()
        supply=self.product(kind='INSUMO')
        service=self.service()
        visit=self.visit()
        sale=self.sale([self.product_line(product),self.service_line(service)],visit)
        service_line=next(row for row in self.detail(sale)['lineas'] if row['tipo']=='SERVICIO')
        groups=[{'detalle_id':service_line['id'],'insumos':[{'articulo_id':supply.pk,'unidad_id':self.unit.pk,'cantidad':'1.000'}]}]
        original=inventory.create_sale_movement
        calls=[]
        def fail_second(**fields):
            calls.append(fields)
            if len(calls)==2:raise RuntimeError('Fallo ficticio')
            return original(**fields)
        key=str(uuid.uuid4())
        with patch('apps.inventario.services.create_sale_movement',side_effect=fail_second):
            with self.assertRaises(RuntimeError):self.confirm(sale,groups,key)
        self.assertEqual(m.ConsumosServicio.objects.count(),0)
        self.assertEqual(m.MovimientosInventario.objects.filter(motivo__in=['CONSUMO_SERVICIO','VENTA_PRODUCTO']).count(),0)
        self.assertEqual(m.Ventas.objects.get(pk=sale).estado,'BORRADOR')
        self.assertEqual(m.Visitas.objects.get(pk=visit).estado,'ABIERTA')
        self.assertFalse(IdempotencyRecord.objects.filter(key=key).exists())
        self.assertEqual(self.confirm(sale,groups,key).status_code,200)

    def test_insumo_type_and_duplicate_real_consumption_rejected(self):
        supply=self.product(kind='INSUMO')
        sale=self.sale([self.service_line(self.service())],self.visit())
        line=self.detail(sale)['lineas'][0]
        item={'articulo_id':supply.pk,'unidad_id':self.unit.pk,'cantidad':'1.000'}
        self.assertEqual(self.confirm(sale,[{'detalle_id':line['id'],'insumos':[item,item]}]).status_code,400)
        product=self.product()
        item['articulo_id']=product.pk
        self.assertEqual(self.confirm(sale,[{'detalle_id':line['id'],'insumos':[item]}]).status_code,400)

