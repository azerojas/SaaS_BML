from decimal import Decimal as D
from django.test import SimpleTestCase
from apps.finanzas.domain.errors import FinanceError
from apps.finanzas.domain.money import sale_totals,commission,money,quantize


class MoneyTests(SimpleTestCase):
    def line(self,q='1',p='1',d='0'):
        return {'cantidad':D(q),'precio_unitario':D(p),'descuento_linea':D(d)}

    def test_half_up_at_line_boundary(self):
        result=sale_totals([self.line('.005','1'),self.line('.005','1')],D('0'),D('0'))
        self.assertEqual(result['subtotal'],D('.02'))

    def test_discount_allocation_exact_cents_and_stable_tie(self):
        result=sale_totals([self.line(),self.line(),self.line()],D('.01'),D('0'))
        self.assertEqual(result['descuentos_globales_linea'],[D('.01'),D('0'),D('0')])
        self.assertEqual(sum(result['descuentos_globales_linea']),D('.01'))

    def test_total_and_tip_separated(self):
        result=sale_totals([self.line('2','10','3')],D('2'),D('5'))
        self.assertEqual((result['subtotal'],result['total']),(D('17'),D('20')))

    def test_global_and_line_discount_limits(self):
        for lines,discount in [([self.line('1','1','2')],D('0')),([self.line()],D('2'))]:
            with self.assertRaises(FinanceError):sale_totals(lines,discount,D('0'))

    def test_raw_gross_prevents_excess_discount_even_when_rounded_gross_is_higher(self):
        with self.assertRaises(FinanceError):sale_totals([self.line('.005','1','.01')],D('0'),D('0'))

    def test_float_nan_and_overflow_are_rejected(self):
        for value in [1.1,D('NaN'),D('Infinity'),D('10000000000')]:
            with self.assertRaises(FinanceError):money(value)

    def test_commission_excludes_global_discount_and_tip(self):
        self.assertEqual(commission(D('63.64'),D('10')),D('6.36'))

    def test_negative_margin_is_representable(self):
        self.assertEqual(quantize(D('-1.005')),D('-1.01'))

