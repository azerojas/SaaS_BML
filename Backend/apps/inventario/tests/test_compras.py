from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from django.db import IntegrityError, transaction
from django.utils import timezone
from negocio import models as m
from apps.inventario import services
from .base import API, InventoryTestCase


class PurchaseTests(InventoryTestCase):
    def test_numeric_json_quantities_and_costs_rejected(self):
        line=self.line()
        for field,value in [('cantidad',1),('cantidad',1.0000000000000001),('costo_unitario',0.1)]:
            self.assertEqual(self.client.post(API+'compras/',{'detalles':[{**line,field:value}]},format='json').status_code,400)

    def test_received_retry_after_article_and_supplier_deactivation(self):
        provider=self.provider()
        article=self.article()
        purchase=self.purchase([self.line(article)],proveedor_id=provider['id'])
        self.assertEqual(self.receive(purchase).status_code,200)
        m.Articulos.objects.filter(pk=article['id']).update(activo=False)
        m.Proveedores.objects.filter(pk=provider['id']).update(activo=False)
        self.assertEqual(self.receive(purchase).status_code,200)
        self.assertEqual(m.MovimientosInventario.objects.count(),1)

    def test_draft_total_rounding_and_header_edits(self):
        article=self.article()
        line=self.line(article,cantidad='0.125',costo_unitario='0.0400')
        purchase=self.purchase([line,line],numero_documento='FAC-FICTICIA')
        self.assertEqual(purchase['estado'],'BORRADOR')
        self.assertEqual(purchase['total'],'0.01')
        self.assertEqual(len(purchase['detalles']),2)
        obj=m.Compras.objects.get(pk=purchase['id'])
        self.assertEqual(obj.creado_por_id,self.admin.pk)
        self.assertEqual(m.MovimientosInventario.objects.count(),0)
        r=self.client.patch(API+'compras/'+str(obj.pk)+'/',{'observaciones':'Nota ficticia'},format='json')
        self.assertEqual(r.status_code,200)
        self.assertEqual(r.json()['total'],'0.01')
        self.assertEqual(len(r.json()['detalles']),2)

    def test_receive_creates_exactly_one_movement_per_line_and_retries(self):
        provider=self.provider()
        a=self.article()
        b=self.article()
        purchase=self.purchase([self.line(a),self.line(b,cantidad='1.125',costo_unitario='2.0001')],proveedor_id=provider['id'])
        r=self.receive(purchase)
        self.assertEqual(r.status_code,200,r.data)
        self.assertEqual(r.json()['estado'],'RECIBIDA')
        self.assertEqual(r.json()['total'],'8.75')
        self.assertEqual(m.MovimientosInventario.objects.count(),2)
        self.assertEqual({x.detalle_compra_id for x in m.MovimientosInventario.objects.all()},{x['id'] for x in purchase['detalles']})
        self.assertEqual(self.stock_row(a)['existencia'],'2.000')
        self.assertEqual(self.stock_row(b)['existencia'],'1.125')
        self.assertEqual(self.receive(purchase).json(),r.json())
        self.assertEqual(m.MovimientosInventario.objects.count(),2)
        self.assertEqual(m.Auditoria.objects.filter(entidad='compras',accion='RECIBIR').count(),1)
        for obj in m.MovimientosInventario.objects.all():
            self.assertEqual(obj.registrado_por_id,self.admin.pk)
            self.assertEqual(obj.motivo,'COMPRA')

    def test_empty_draft_allowed_but_cannot_receive(self):
        purchase=self.purchase()
        self.assertEqual(purchase['total'],'0.00')
        self.assertEqual(self.receive(purchase).status_code,400)
        self.assertEqual(m.MovimientosInventario.objects.count(),0)

    def test_details_replacement_and_total_recalculation(self):
        a=self.article()
        purchase=self.purchase([self.line(a)])
        path=API+'compras/'+str(purchase['id'])+'/'
        r=self.client.patch(path,{'detalles':[self.line(a,cantidad='3.000',costo_unitario='1.1111')]},format='json')
        self.assertEqual(r.status_code,200,r.data)
        self.assertEqual(r.json()['total'],'3.33')
        self.assertEqual(m.DetallesCompra.objects.count(),1)
        m.Compras.objects.filter(pk=purchase['id']).update(total=999)
        self.assertEqual(self.receive(purchase).json()['total'],'3.33')

    def test_received_or_cancelled_purchases_are_immutable(self):
        for received in [True,False]:
            purchase=self.purchase([self.line()])
            path=API+'compras/'+str(purchase['id'])+'/'
            if received:
                self.assertEqual(self.receive(purchase).status_code,200)
                self.assertEqual(self.client.post(path+'anular/').status_code,409)
            else:
                self.assertEqual(self.client.post(path+'anular/').status_code,200)
                self.assertEqual(self.client.post(path+'anular/').status_code,200)
                self.assertEqual(self.receive(purchase).status_code,409)
            self.assertEqual(self.client.patch(path,{'observaciones':'Cambio'},format='json').status_code,409)
            self.assertEqual(self.client.delete(path).status_code,405)

    def test_line_validation_and_overflow_are_controlled(self):
        article=self.article()
        base=self.line(article)
        for field,value in [('cantidad','0'),('cantidad','-1'),('cantidad','1.0001'),
                            ('costo_unitario','-1'),('costo_unitario','1.00001'),
                            ('articulo_id',999999),('unidad_id',self.other_unit.pk),
                            ('numero_lote','x'*81),('vencimiento','bad'),('factor_conversion',10)]:
            with self.subTest(field=field):
                r=self.client.post(API+'compras/',{'detalles':[{**base,field:value}]},format='json')
                self.assertEqual(r.status_code,400,r.data)
        r=self.client.post(API+'compras/',{'detalles':[{**base,'cantidad':'99999999999.999','costo_unitario':'99999999.9999'}]},format='json')
        self.assertEqual(r.status_code,400)

    def test_sensitive_fields_rejected_and_reception_body_empty(self):
        for field,value in [('total','1'),('estado','RECIBIDA'),('creado_por_id',1)]:
            self.assertEqual(self.client.post(API+'compras/',{field:value},format='json').status_code,400)
        purchase=self.purchase([self.line()])
        r=self.client.post(API+'compras/'+str(purchase['id'])+'/recibir/',{'total':1},format='json')
        self.assertEqual(r.status_code,400)
        self.assertEqual(m.MovimientosInventario.objects.count(),0)

    def test_supplier_and_article_active_at_draft_and_reception(self):
        provider=self.provider()
        a=self.article()
        purchase=self.purchase([self.line(a)],proveedor_id=provider['id'])
        self.client.post(API+'proveedores/'+str(provider['id'])+'/desactivar/')
        self.assertEqual(self.receive(purchase).status_code,409)
        self.assertEqual(self.client.post(API+'compras/',{'proveedor_id':provider['id']},format='json').status_code,409)
        self.client.post(API+'proveedores/'+str(provider['id'])+'/reactivar/')
        m.Articulos.objects.filter(pk=a['id']).update(activo=False)
        self.assertEqual(self.receive(purchase).status_code,409)
        self.assertEqual(self.client.post(API+'compras/',{'detalles':[self.line(a)]},format='json').status_code,409)
        self.assertEqual(self.client.post(API+'compras/',{'proveedor_id':999999},format='json').status_code,400)

    def test_expired_reception_rejected(self):
        purchase=self.purchase([self.line(vencimiento=(timezone.localdate()-timedelta(days=1)).isoformat())])
        self.assertEqual(self.receive(purchase).status_code,400)
        self.assertEqual(m.MovimientosInventario.objects.count(),0)

    def test_failure_after_first_movement_rolls_back_everything(self):
        purchase=self.purchase([self.line(),self.line()])
        create=services.create_purchase_movement
        calls=[]
        def fail_second(line,user):
            calls.append(line.pk)
            if len(calls)==2:
                raise RuntimeError('Fallo ficticio')
            return create(line,user)
        with patch('apps.inventario.services.create_purchase_movement',side_effect=fail_second):
            with self.assertRaises(RuntimeError):
                self.receive(purchase)
        self.assertEqual(m.Compras.objects.get(pk=purchase['id']).estado,'BORRADOR')
        self.assertEqual(m.MovimientosInventario.objects.count(),0)
        self.assertEqual(m.Auditoria.objects.filter(accion='RECIBIR').count(),0)
        self.assertEqual(self.receive(purchase).status_code,200)

    def test_purchase_movement_unique_index_and_inconsistent_receipt(self):
        purchase=self.purchase([self.line()])
        self.assertEqual(self.receive(purchase).status_code,200)
        obj=m.MovimientosInventario.objects.get()
        with self.assertRaises(IntegrityError),transaction.atomic():
            m.MovimientosInventario.objects.create(articulo_id=obj.articulo_id,motivo='COMPRA',cantidad_firmada=1,detalle_compra_id=obj.detalle_compra_id)
        m.MovimientosInventario.objects.filter(pk=obj.pk).update(cantidad_firmada=3)
        self.assertEqual(self.receive(purchase).status_code,409)
        self.assertEqual(m.MovimientosInventario.objects.count(),1)

    def test_stock_overflow_reception_rolls_back(self):
        article=self.article()
        purchase=self.purchase([self.line(article,cantidad='99999999999.999',costo_unitario='0')])
        self.assertEqual(self.adjustment(article,cantidad='1').status_code,201)
        self.assertEqual(self.receive(purchase).status_code,400)
        self.assertEqual(m.Compras.objects.get(pk=purchase['id']).estado,'BORRADOR')
        self.assertEqual(m.MovimientosInventario.objects.count(),1)

