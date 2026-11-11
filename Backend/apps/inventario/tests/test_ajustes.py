import uuid
from unittest.mock import patch
from django.db import IntegrityError, transaction
from negocio import models as m
from .base import API, InventoryTestCase


class AdjustmentTests(InventoryTestCase):
    def test_entry_exit_and_resulting_balance(self):
        article=self.article()
        r=self.adjustment(article,cantidad='5.125')
        self.assertEqual(r.status_code,201,r.data)
        self.assertEqual(r.json()['saldo_resultante'],'5.125')
        self.assertEqual(r.json()['valoracion'],'NO_VALORIZADO')
        self.assertEqual(r.json()['costo_unitario'],'0.0000')
        self.assertEqual(self.stock_row(article)['costo_unitario_estimado'],None)
        r=self.adjustment(article,tipo='AJUSTE_SALIDA',cantidad='2.000')
        self.assertEqual(r.status_code,201)
        self.assertEqual(r.json()['cantidad_firmada'],'-2.000')
        self.assertEqual(self.stock_row(article)['existencia'],'3.125')
        self.assertEqual(m.MovimientosInventario.objects.count(),2)

    def test_insufficient_stock_and_inactive_article(self):
        article=self.article()
        self.assertEqual(self.adjustment(article,tipo='AJUSTE_SALIDA',cantidad='1').status_code,409)
        self.assertEqual(m.MovimientosInventario.objects.count(),0)
        m.Articulos.objects.filter(pk=article['id']).update(activo=False)
        self.assertEqual(self.adjustment(article).status_code,409)

    def test_idempotency_after_later_movements_returns_original_balance(self):
        article=self.article()
        key=str(uuid.uuid4())
        first=self.adjustment(article,key=key)
        self.assertEqual(first.status_code,201)
        self.adjustment(article,cantidad='2')
        retry=self.adjustment(article,key=key)
        self.assertEqual(retry.status_code,200)
        self.assertEqual(retry.json(),first.json())
        self.assertEqual(self.stock_row(article)['existencia'],'7.000')
        self.assertEqual(m.MovimientosInventario.objects.count(),2)
        self.assertEqual(self.adjustment(article,key=key,cantidad='6').status_code,409)

    def test_bad_key_quantity_unit_reason_and_sensitive_fields(self):
        article=self.article()
        base={'articulo_id':article['id'],'unidad_id':self.unit.pk,'tipo':'AJUSTE_ENTRADA','cantidad':'1','justificacion':'Conteo ficticio correcto'}
        for key in [None,'bad','00000000-0000-0000-0000-000000000000']:
            headers={'HTTP_IDEMPOTENCY_KEY':key} if key else {}
            self.assertEqual(self.client.post(API+'inventario/ajustes/',base,format='json',**headers).status_code,400)
        cases=[('cantidad','0'),('cantidad','-1'),('cantidad','0.0001'),('cantidad',1.125),('tipo','DEVOLUCION'),
               ('tipo','CONSUMO_SERVICIO'),('tipo','VENTA_PRODUCTO'),('justificacion',' '),
               ('justificacion','corto'),('unidad_id',self.other_unit.pk),('costo_unitario','99'),
               ('registrado_por_id',1),('cantidad_firmada','999'),('detalle_compra_id',1)]
        for field,value in cases:
            with self.subTest(field=field):
                r=self.client.post(API+'inventario/ajustes/',{**base,field:value},format='json',HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
                self.assertEqual(r.status_code,400,r.data)
        self.assertEqual(m.MovimientosInventario.objects.count(),0)

    def test_audit_failure_rolls_back_and_does_not_consume_key(self):
        article=self.article()
        key=str(uuid.uuid4())
        with patch('apps.inventario.services.audit',side_effect=RuntimeError('Fallo ficticio')):
            with self.assertRaises(RuntimeError):
                self.adjustment(article,key=key)
        self.assertEqual(m.MovimientosInventario.objects.count(),0)
        self.assertEqual(self.adjustment(article,key=key).status_code,201)

    def test_ledger_immutable_and_audited_without_full_reason(self):
        article=self.article()
        result=self.adjustment(article).json()
        pk=result['movimiento_id']
        path=API+'inventario/movimientos/'+str(pk)+'/'
        self.assertEqual(self.client.get(path).status_code,200)
        for method in ['post','put','patch','delete']:
            self.assertEqual(getattr(self.client,method)(path,{},format='json').status_code,405)
        self.assertEqual(self.client.post(API+'inventario/movimientos/',{},format='json').status_code,405)
        obj=m.MovimientosInventario.objects.get(pk=pk)
        self.assertEqual(obj.notas,'Conteo fisico ficticio')
        audit=m.Auditoria.objects.filter(entidad='movimientos_inventario',entidad_id=str(pk),accion='AJUSTAR').get()
        self.assertNotIn('Conteo fisico',str(audit.datos))

    def test_sql_sign_constraint_for_devolucion(self):
        article=self.article()
        with self.assertRaises(IntegrityError),transaction.atomic():
            m.MovimientosInventario.objects.create(articulo_id=article['id'],motivo='DEVOLUCION',cantidad_firmada=-1)

