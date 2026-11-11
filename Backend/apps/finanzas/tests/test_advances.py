import uuid
from decimal import Decimal
from django.db import connection
from django.utils import timezone
from datetime import timedelta
from negocio import models as m
from apps.finanzas.models import AdvanceApplication
from .base import API,FinanceTestCase


class AdvanceTests(FinanceTestCase):
    def test_ambiguous_legacy_payment_and_advance_is_blocked_for_reconciliation(self):
        _,appointment,sale=self.confirmed_visit_sale()
        advance=self.advance(appointment,'20.00')
        self.confirm_advance(advance)
        m.AnticiposCita.objects.filter(pk=advance).update(venta_id=sale)
        m.Pagos.objects.create(venta_id=sale,metodo='EFECTIVO',monto=Decimal('20'))
        response=self.client.get(API+'ventas/'+str(sale)+'/')
        self.assertEqual(response.status_code,409)
        self.assertEqual(response.json()['code'],'anticipo_legacy_ambiguo')

    def appointment(self,visit=None,price='100.00'):
        now=timezone.now()+timedelta(hours=m.Citas.objects.count())
        with connection.cursor() as c:
            c.execute("INSERT INTO profesionales(nombres,apellidos) VALUES ('Profesional','Ficticia') RETURNING id")
            professional=c.fetchone()[0]
            c.execute('INSERT INTO citas(clienta_id,profesional_id,visita_id,inicio_en,fin_en,precio_total) VALUES (%s,%s,%s,%s,%s,%s) RETURNING id',
                      [self.person.pk,professional,visit,now,now+timedelta(minutes=30),price])
            return c.fetchone()[0]

    def advance(self,appointment,amount='30.00',method='EFECTIVO',reference=None):
        r=self.mutate('anticipos/',{'cita_id':appointment,'metodo':method,'monto':amount,'referencia':reference},expected=201)
        return r.json()['anticipo_id']

    def confirm_advance(self,pk,**data):
        return self.mutate('anticipos/'+str(pk)+'/confirmar/',{'verificado_manualmente':True,**data})

    def confirmed_visit_sale(self,price='100.00'):
        visit=self.visit()
        appointment=self.appointment(visit,price)
        article=self.product(price=price)
        sale=self.sale([self.product_line(article)],visit)
        self.assertEqual(self.confirm(sale).status_code,200)
        return visit,appointment,sale

    def test_partial_applications_and_cash_are_not_double_counted(self):
        _,appointment,sale=self.confirmed_visit_sale()
        advance=self.advance(appointment)
        self.assertEqual(self.confirm_advance(advance).status_code,200)
        self.assertEqual(m.Pagos.objects.count(),0)
        self.assertEqual(self.client.get(API+'ventas/'+str(sale)+'/anticipos-aplicables/').json()['anticipos'][0]['id'],advance)
        first=self.mutate('ventas/'+str(sale)+'/aplicar-anticipo/',{'anticipo_id':advance,'monto':'10.00'},expected=201)
        self.assertEqual(first.json()['saldo_pendiente'],'90.00')
        second=self.mutate('ventas/'+str(sale)+'/aplicar-anticipo/',{'anticipo_id':advance,'monto':'20.00'},expected=201)
        self.assertEqual(second.json()['anticipos_aplicados'],'30.00')
        paid=self.pay(sale,'70.00')
        self.assertEqual(paid.status_code,201)
        self.assertEqual(paid.json()['saldo_pendiente'],'0.00')
        self.assertEqual(paid.json()['pagos_confirmados'],'70.00')
        self.assertEqual(paid.json()['cobertura_total'],'100.00')
        self.assertEqual(m.Pagos.objects.count(),1)
        self.assertEqual(m.AnticiposCita.objects.get(pk=advance).monto,Decimal('30'))
        self.assertIsNone(m.AnticiposCita.objects.get(pk=advance).venta_id)
        self.assertEqual(AdvanceApplication.objects.count(),2)

    def test_application_retry_and_limits(self):
        _,appointment,sale=self.confirmed_visit_sale()
        advance=self.advance(appointment)
        self.confirm_advance(advance)
        key=str(uuid.uuid4())
        data={'anticipo_id':advance,'monto':'20.00'}
        first=self.mutate('ventas/'+str(sale)+'/aplicar-anticipo/',data,key,expected=201)
        second=self.mutate('ventas/'+str(sale)+'/aplicar-anticipo/',data,key,expected=201)
        self.assertEqual(first.json(),second.json())
        self.assertEqual(AdvanceApplication.objects.count(),1)
        self.assertEqual(self.mutate('ventas/'+str(sale)+'/aplicar-anticipo/',{**data,'monto':'11.00'}).status_code,409)
        self.assertEqual(self.mutate('ventas/'+str(sale)+'/aplicar-anticipo/',{**data,'monto':'10.00'},key).status_code,409)

    def test_advance_wrong_attention_unconfirmed_or_no_visit_rejected(self):
        _,appointment,sale=self.confirmed_visit_sale()
        advance=self.advance(appointment)
        self.assertEqual(self.mutate('ventas/'+str(sale)+'/aplicar-anticipo/',{'anticipo_id':advance,'monto':'1'}).status_code,409)
        self.confirm_advance(advance)
        other=self.sale([self.product_line(self.product())])
        self.confirm(other)
        self.assertEqual(self.mutate('ventas/'+str(other)+'/aplicar-anticipo/',{'anticipo_id':advance,'monto':'1'}).status_code,409)

    def test_pending_can_be_cancelled_confirmed_requires_actual_refund_design(self):
        appointment=self.appointment()
        pending=self.advance(appointment)
        self.assertEqual(self.mutate('anticipos/'+str(pending)+'/anular/',{'motivo':'Solicitud duplicada'}).status_code,200)
        confirmed=self.advance(appointment)
        self.assertEqual(self.confirm_advance(confirmed).status_code,200)
        self.assertEqual(self.mutate('anticipos/'+str(confirmed)+'/anular/',{'motivo':'Solicita devolucion'}).status_code,409)
        self.assertEqual(m.AnticiposCita.objects.get(pk=confirmed).estado,'CONFIRMADO')

    def test_confirm_reference_can_be_supplied_later_and_not_counted_twice(self):
        appointment=self.appointment()
        pk=self.advance(appointment,method='YAPE')
        response=self.confirm_advance(pk,referencia=' op-321 ')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(m.AnticiposCita.objects.get(pk=pk).referencia,'OP-321')
        _,_,sale=self.confirmed_visit_sale()
        self.assertEqual(self.pay(sale,'1','YAPE','OP-321').status_code,409)

    def test_advance_total_capped_by_appointment_and_sale_balance(self):
        visit,appointment,sale=self.confirmed_visit_sale(price='20.00')
        large=self.advance(appointment,'20.01')
        self.assertEqual(self.confirm_advance(large).status_code,409)
        advance=self.advance(appointment,'20.00')
        self.confirm_advance(advance)
        self.pay(sale,'15.00')
        self.assertEqual(self.mutate('ventas/'+str(sale)+'/aplicar-anticipo/',{'anticipo_id':advance,'monto':'5.01'}).status_code,409)
        self.assertEqual(self.mutate('ventas/'+str(sale)+'/aplicar-anticipo/',{'anticipo_id':advance,'monto':'5.00'}).status_code,201)

    def test_legacy_advance_is_counted_once_and_cannot_be_reapplied(self):
        _,appointment,sale=self.confirmed_visit_sale()
        advance=self.advance(appointment,'20.00')
        self.confirm_advance(advance)
        m.AnticiposCita.objects.filter(pk=advance).update(venta_id=sale)
        detail=self.detail(sale)
        self.assertEqual(detail['saldo']['anticipos_aplicados'],'20.00')
        self.assertEqual(detail['saldo']['saldo_pendiente'],'80.00')
        self.assertEqual(self.mutate('ventas/'+str(sale)+'/aplicar-anticipo/',{'anticipo_id':advance,'monto':'1.00'}).status_code,409)

