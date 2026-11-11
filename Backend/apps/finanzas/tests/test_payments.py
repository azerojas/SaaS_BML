import uuid
from unittest.mock import patch
from negocio import models as m
from apps.finanzas.models import IdempotencyRecord
from .base import API,FinanceTestCase


class PaymentTests(FinanceTestCase):
    def test_same_key_cannot_be_reused_for_another_sale(self):
        first=self.confirmed_sale()
        second=self.confirmed_sale()
        key=str(uuid.uuid4())
        self.assertEqual(self.pay(first,'5.00',key=key).status_code,201)
        self.assertEqual(self.pay(second,'5.00',key=key).status_code,409)
        self.assertEqual(m.Pagos.objects.count(),1)

    def confirmed_sale(self,price='20.00'):
        article=self.product(price=price)
        sale=self.sale([self.product_line(article)])
        self.assertEqual(self.confirm(sale).status_code,200)
        return sale

    def test_partial_mixed_payments_and_overpay(self):
        sale=self.confirmed_sale()
        first=self.pay(sale,'5.00')
        self.assertEqual(first.status_code,201,first.data)
        self.assertEqual(first.json()['saldo_pendiente'],'15.00')
        second=self.pay(sale,'7.00','YAPE',' op 123 ')
        self.assertEqual(second.status_code,201,second.data)
        self.assertEqual(second.json()['saldo_pendiente'],'8.00')
        self.assertEqual(m.Pagos.objects.get(metodo='YAPE').referencia,'OP123')
        self.assertEqual(self.pay(sale,'8.01').status_code,409)
        self.assertEqual(self.pay(sale,'8.00','PLIN','PL-999').json()['saldo_pendiente'],'0.00')
        self.assertEqual(m.Pagos.objects.filter(estado='CONFIRMADO').count(),3)

    def test_key_replay_and_changed_payload_conflict(self):
        sale=self.confirmed_sale()
        key=str(uuid.uuid4())
        first=self.pay(sale,'5.00',key=key)
        retry=self.pay(sale,'5.00',key=key)
        self.assertEqual(first.status_code,201)
        self.assertEqual(retry.status_code,201)
        self.assertEqual(retry.json(),first.json())
        self.assertEqual(self.pay(sale,'6.00',key=key).status_code,409)
        self.assertEqual(m.Pagos.objects.count(),1)

    def test_reference_prevents_duplicate_cobro_even_with_new_key(self):
        sale=self.confirmed_sale()
        self.assertEqual(self.pay(sale,'5.00','TRANSFERENCIA','ref-1').status_code,201)
        self.assertEqual(self.pay(sale,'5.00','TRANSFERENCIA',' REF-1 ').status_code,409)
        self.assertEqual(self.pay(sale,'1.00','YAPE').status_code,400)

    def test_draft_cancelled_and_unverified_cannot_collect(self):
        article=self.product()
        sale=self.sale([self.product_line(article)])
        self.assertEqual(self.pay(sale).status_code,409)
        self.mutate('ventas/'+str(sale)+'/anular/',{'motivo':'Borrador equivocado'},expected=200)
        self.assertEqual(self.pay(sale).status_code,409)
        sale=self.confirmed_sale()
        r=self.mutate('ventas/'+str(sale)+'/pagar/',{'metodo':'EFECTIVO','monto':'1.00','verificado_manualmente':False})
        self.assertEqual(r.status_code,400)
        self.assertEqual(m.Pagos.objects.count(),0)

    def test_invalid_amounts_methods_and_server_fields(self):
        sale=self.confirmed_sale()
        base={'metodo':'EFECTIVO','monto':'1.00','verificado_manualmente':True}
        for field,value in [('monto','0'),('monto','-1'),('monto','1.001'),('monto',1.5),('metodo','BITCOIN'),
                            ('estado','CONFIRMADO'),('pagado_en','2026-01-01'),('registrado_por_id',1)]:
            self.assertEqual(self.mutate('ventas/'+str(sale)+'/pagar/',{**base,field:value}).status_code,400)

    def test_void_error_is_audited_not_refund_and_restores_balance_only(self):
        sale=self.confirmed_sale()
        paid=self.pay(sale,'20.00').json()
        payment=paid['pago_id']
        before=m.MovimientosInventario.objects.count()
        bad=self.mutate('pagos/'+str(payment)+'/anular/',{'motivo':'Devolver dinero','error_registro_confirmado':False})
        self.assertEqual(bad.status_code,409)
        key=str(uuid.uuid4())
        data={'motivo':'Error de digitacion ficticio','error_registro_confirmado':True}
        first=self.mutate('pagos/'+str(payment)+'/anular/',data,key,expected=200)
        retry=self.mutate('pagos/'+str(payment)+'/anular/',data,key,expected=200)
        self.assertEqual(first.json(),retry.json())
        self.assertEqual(first.json()['saldo_pendiente'],'20.00')
        self.assertEqual(m.Pagos.objects.get(pk=payment).estado,'ANULADO')
        self.assertEqual(m.MovimientosInventario.objects.count(),before)
        self.assertFalse(m.Auditoria.objects.get(entidad='pagos',accion='ANULAR_PAGO').datos['reembolso_real'])

    def test_failed_audit_rolls_back_payment_and_key(self):
        sale=self.confirmed_sale()
        key=str(uuid.uuid4())
        with patch('apps.finanzas.application.payments.record',side_effect=RuntimeError('Fallo ficticio')):
            with self.assertRaises(RuntimeError):self.pay(sale,'5.00',key=key)
        self.assertEqual(m.Pagos.objects.count(),0)
        self.assertFalse(IdempotencyRecord.objects.filter(key=key).exists())
        self.assertEqual(self.pay(sale,'5.00',key=key).status_code,201)

