import hashlib
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timedelta
from threading import Barrier
from decimal import Decimal
from django.db import connections,connection,IntegrityError,transaction
from django.utils import timezone
from rest_framework.test import APIClient
from apps.finanzas.models import Refund,SaleAdjustment,CashReconciliation
from apps.finanzas.application.cash_ledger import daily_snapshot,reconciled_range
from apps.reporting.domain.periods import ReportFilter,ZONE
from apps.reporting.tests.base import ReportTestCase
from negocio import models as m


class CashLedgerTests(ReportTestCase):
    def test_large_cash_range_stays_blocked_without_returning_false_zero(self):
        from unittest.mock import patch
        from apps.finanzas.domain.errors import FinanceError
        yesterday=timezone.localdate()-timedelta(days=1)
        self.assertEqual(self.close(yesterday,'0.00').status_code,201)
        with patch('apps.finanzas.application.cash_ledger.range_snapshots',side_effect=FinanceError('cierre_demasiado_grande','Limite','invalid')):
            result=reconciled_range(ReportFilter(yesterday,timezone.localdate(),metodo='EFECTIVO'))
        self.assertIsNone(result['neto'])
        self.assertFalse(result['conciliada'])
        self.assertEqual(result['motivo'],'CONCILIACION_EXCEDE_LIMITE_DE_FUENTES')

    def paid_sale(self):
        article=self.product(price='100.00')
        sale=self.sale([self.product_line(article)])
        self.assertEqual(self.confirm(sale).status_code,200)
        payment=self.pay(sale,'100.00')
        self.assertEqual(payment.status_code,201)
        return sale,payment.json()['pago_id']

    def refund(self,payment,amount='20.00',key=None,**changes):
        return self.mutate('reembolsos/',{'pago_id':payment,'monto':amount,'metodo':'EFECTIVO',
            'motivo':'Devolucion comercial ficticia','devolucion_verificada':True,**changes},key=key)

    def test_refund_retries_adjustment_and_original_history_are_preserved(self):
        sale,payment=self.paid_sale()
        original=m.Ventas.objects.values().get(pk=sale)
        movements=m.MovimientosInventario.objects.count()
        key=str(uuid.uuid4())
        self.assertEqual(self.refund(payment,key=key).status_code,201)
        self.assertEqual(self.refund(payment,key=key).status_code,201)
        self.assertEqual(Refund.objects.count(),1)
        self.assertEqual(self.detail(sale)['saldo']['saldo_pendiente'],'20.00')
        self.assertEqual(self.mutate(f'ventas/{sale}/ajustar/',{'monto':'20.00','motivo':'Ajuste comercial ficticio'}).status_code,201)
        self.assertEqual(self.detail(sale)['saldo']['saldo_pendiente'],'0.00')
        self.assertEqual(original,m.Ventas.objects.values().get(pk=sale))
        self.assertEqual(m.MovimientosInventario.objects.count(),movements)
        self.assertEqual(self.pay(sale,'1.00').status_code,409)
        self.assertEqual(self.mutate(f'pagos/{payment}/anular/',{'error_registro_confirmado':True,'motivo':'Error de cobro ficticio'}).status_code,409)

    def test_refund_limits_decimal_input_references_permissions_and_no_delete(self):
        sale,payment=self.paid_sale()
        self.assertEqual(self.refund(payment,'100.01').status_code,409)
        self.assertEqual(self.refund(payment,amount=0.1).status_code,400)
        self.assertEqual(self.refund(payment,metodo='YAPE').status_code,400)
        self.assertEqual(self.refund(payment,metodo='YAPE',referencia='DEV-TEST').status_code,201)
        self.assertEqual(self.refund(payment,metodo='YAPE',referencia='DEV-TEST').status_code,409)
        self.assertEqual(self.mutate(f'ventas/{sale}/ajustar/',{'monto':'21.00','motivo':'Demasiado ajuste ficticio'}).status_code,409)
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.refund(payment).status_code,403)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.delete('/api/reembolsos/').status_code,405)

    def test_concurrent_refunds_cannot_exceed_original_cash(self):
        _,payment=self.paid_sale()
        gate=Barrier(2)
        def run():
            try:
                client=APIClient();client.force_authenticate(self.admin)
                gate.wait(10)
                return client.post('/api/reembolsos/',{'pago_id':payment,'monto':'70.00','metodo':'EFECTIVO',
                    'motivo':'Devolucion concurrente ficticia','devolucion_verificada':True},format='json',HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4())).status_code
            finally:connections['default'].close()
        with ThreadPoolExecutor(max_workers=2) as pool:result=list(pool.map(lambda _:run(),range(2)))
        self.assertEqual(sorted(result),[201,409])
        self.assertEqual(Refund.objects.get().monto,Decimal('70.00'))

    def test_foreign_keys_exactly_one_source_and_positive_amount(self):
        with self.assertRaises(IntegrityError),transaction.atomic():
            Refund.objects.create(pago_id=999999,monto=1,metodo='EFECTIVO',motivo='Ficticio',clave_operacion=uuid.uuid4(),creado_por=self.admin)
        with self.assertRaises(IntegrityError),transaction.atomic():
            Refund.objects.create(monto=1,metodo='EFECTIVO',motivo='Ficticio',clave_operacion=uuid.uuid4(),creado_por=self.admin)

    def close(self,day,observed='80.00',key=None,method='EFECTIVO'):
        return self.mutate('conciliaciones/',{'fecha':day.isoformat(),'metodo':method,'observado':observed,
            'evidencia_sha256':hashlib.sha256(b'Synthetic local evidence only').hexdigest(),'referencia':'CIERRE-FICTICIO-TEST'},key=key)

    def test_evidence_closure_reports_net_once_and_late_changes_require_new_revision(self):
        sale,payment=self.paid_sale()
        self.assertEqual(self.refund(payment).status_code,201)
        day=timezone.localdate()-timedelta(days=1)
        instant=datetime.combine(day,datetime.min.time(),ZONE)+timedelta(hours=12)
        m.Pagos.objects.filter(pk=payment).update(pagado_en=instant)
        Refund.objects.all().update(creada_en=instant)
        filters=ReportFilter(day,day+timedelta(days=1),metodo='EFECTIVO')
        self.assertIsNone(reconciled_range(filters)['neto'])
        self.assertEqual(self.close(day,'79.99').status_code,409)
        key=str(uuid.uuid4())
        self.assertEqual(self.close(day,key=key).status_code,201)
        self.assertEqual(self.close(day,key=key).status_code,201)
        self.assertEqual(CashReconciliation.objects.count(),1)
        self.assertEqual(reconciled_range(filters)['neto'],Decimal('80.00'))
        for method in ['YAPE','PLIN','TRANSFERENCIA','TARJETA','OTRO']:
            self.assertEqual(self.close(day,'0.00',method=method).status_code,201)
        result=self.get_report(query=f'?desde={day}&hasta={day+timedelta(days=1)}')
        self.assertEqual(result['indicadores']['dinero_recaudado'],'80.00')
        self.assertTrue(result['calidad']['recaudacion_conciliada'])
        self.assertEqual(self.refund(payment,'10.00').status_code,201)
        Refund.objects.all().update(creada_en=instant)
        self.assertIsNone(reconciled_range(filters)['neto'])
        self.assertEqual(self.close(day,'70.00').status_code,201)
        self.assertEqual(CashReconciliation.objects.filter(metodo='EFECTIVO').count(),2)
        self.assertEqual(reconciled_range(filters)['neto'],Decimal('70.00'))
        self.assertEqual(m.Ventas.objects.get(pk=sale).total,Decimal('100.00'))

    def test_cannot_close_today_and_empty_day_needs_explicit_zero_evidence(self):
        today=timezone.localdate()
        self.assertEqual(self.close(today,'0.00').status_code,400)
        yesterday=today-timedelta(days=1)
        self.assertEqual(self.close(yesterday,'0.00').status_code,201)
        result=reconciled_range(ReportFilter(yesterday,today,metodo='EFECTIVO'))
        self.assertEqual(result['neto'],Decimal('0.00'))
        self.assertIsNone(reconciled_range(ReportFilter(yesterday,today))['neto'])

    def test_terminal_advance_is_actual_cash_and_refund_does_not_duplicate_application(self):
        from apps.finanzas.tests.test_advances import AdvanceTests
        appointment=AdvanceTests.appointment(self)
        r=self.mutate('anticipos/',{'cita_id':appointment,'metodo':'EFECTIVO','monto':'30.00'},expected=201)
        advance=r.json()['anticipo_id']
        self.assertEqual(self.mutate(f'anticipos/{advance}/confirmar/',{'verificado_manualmente':True}).status_code,200)
        request={'anticipo_id':advance,'monto':'10.00','metodo':'EFECTIVO','motivo':'Cita cancelada ficticia','devolucion_verificada':True}
        self.assertEqual(self.mutate('reembolsos/',request).status_code,409)
        m.Citas.objects.filter(pk=appointment).update(estado='CANCELADA',cancelada_en=timezone.now())
        self.assertEqual(self.mutate('reembolsos/',request).status_code,201)
        self.assertEqual(self.client.get(f'/api/anticipos/{advance}/').json()['disponible'],'20.00')
        self.assertEqual(daily_snapshot(timezone.localdate(),'EFECTIVO')['neto'],Decimal('20.00'))
        self.assertEqual(m.Pagos.objects.count(),0)

    def test_reconciliation_range_queries_are_bounded(self):
        from django.test.utils import CaptureQueriesContext
        today=timezone.localdate()
        for days in (1,20):
            self.close(today-timedelta(days=days),'0.00')
        with CaptureQueriesContext(connection) as q:
            reconciled_range(ReportFilter(today-timedelta(days=20),today,metodo='EFECTIVO'))
        self.assertLessEqual(len(q),4)
