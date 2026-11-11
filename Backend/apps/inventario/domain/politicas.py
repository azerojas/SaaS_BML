from decimal import Decimal, ROUND_HALF_UP, localcontext
from rest_framework.exceptions import ValidationError

MAX_TOTAL = Decimal('9999999999.99')
MAX_QUANTITY = Decimal('99999999999.999')
COST_POLICY = 'PROMEDIO_PONDERADO_COMPRAS_RECIBIDAS_HISTORICAS'


def purchase_total(lines):
    if any(not isinstance(line['cantidad'], Decimal) or not isinstance(line['costo_unitario'], Decimal) for line in lines):
        raise ValidationError('Cantidades y costos requieren Decimal; no se aceptan float.')
    with localcontext() as ctx:
        ctx.prec = 48
        total = sum((line['cantidad'] * line['costo_unitario'] for line in lines), Decimal('0'))
        total = total.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    if total < 0 or total > MAX_TOTAL:
        raise ValidationError({'detalles': 'El total excede NUMERIC(12,2).'})
    return total


def weighted_cost(amount, quantity):
    if amount is None or quantity is None or quantity <= 0:
        return None
    with localcontext() as ctx:
        ctx.prec = 48
        return amount / quantity


def decimal_string(value, places=4):
    if value is None:
        return None
    with localcontext() as ctx:
        ctx.prec = 48
        return format(value.quantize(Decimal('1').scaleb(-places), rounding=ROUND_HALF_UP), 'f')

