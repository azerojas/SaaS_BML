from decimal import Decimal
from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError
from apps.inventario.domain.politicas import purchase_total, weighted_cost, decimal_string


class PolicyTests(SimpleTestCase):
    def test_float_is_rejected(self):
        with self.assertRaises(ValidationError):
            purchase_total([{'cantidad':0.1,'costo_unitario':Decimal('1')}])

    def test_half_up_round_once_and_decimal_cost(self):
        line={'cantidad':Decimal('0.125'),'costo_unitario':Decimal('0.0400')}
        self.assertEqual(purchase_total([line]),Decimal('0.01'))
        self.assertEqual(purchase_total([line,line]),Decimal('0.01'))
        self.assertEqual(decimal_string(weighted_cost(Decimal('12'),Decimal('3'))),'4.0000')

    def test_missing_cost_is_null_and_free_cost_is_real_zero(self):
        self.assertIsNone(weighted_cost(None,Decimal('1')))
        self.assertIsNone(weighted_cost(Decimal('0'),Decimal('0')))
        self.assertEqual(weighted_cost(Decimal('0'),Decimal('1')),Decimal('0'))

    def test_total_overflow_rejected(self):
        with self.assertRaises(ValidationError):
            purchase_total([{'cantidad':Decimal('99999999999.999'),'costo_unitario':Decimal('99999999.9999')}])

