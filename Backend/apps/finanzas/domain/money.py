from decimal import Decimal, ROUND_HALF_UP, ROUND_DOWN, localcontext
from .errors import FinanceError

ZERO = Decimal('0')
MAX_MONEY = Decimal('9999999999.99')
COST_POLICY = 'PROMEDIO_PONDERADO_COMPRAS_RECIBIDAS_HISTORICAS_V1'


def quantize(value, places=2):
    if not isinstance(value, Decimal) or not value.is_finite():
        raise FinanceError('decimal_requerido', 'Se requieren valores Decimal finitos.', 'invalid')
    with localcontext() as ctx:
        ctx.prec = 48
        return value.quantize(Decimal('1').scaleb(-places), rounding=ROUND_HALF_UP)


def money(value):
    result = quantize(value)
    if result < 0 or result > MAX_MONEY:
        raise FinanceError('importe_fuera_rango', 'Importe fuera de NUMERIC(12,2).', 'invalid')
    return result


def sale_totals(lines, discount, tip):
    nets = []
    with localcontext() as ctx:
        ctx.prec = 48
        for line in lines:
            quantity, price, reduction = line['cantidad'], line['precio_unitario'], line['descuento_linea']
            if not all(isinstance(value, Decimal) and value.is_finite() for value in (quantity, price, reduction)):
                raise FinanceError('decimal_requerido', 'Cantidades e importes requieren Decimal.', 'invalid')
            gross = quantity * price
            if quantity <= 0 or price < 0 or reduction < 0 or reduction > gross:
                raise FinanceError('descuento_linea_invalido', 'Cantidad, precio o descuento de linea invalido.', 'invalid')
            nets.append(money(gross - reduction))
        subtotal = money(sum(nets, ZERO))
        discount, tip = money(discount), money(tip)
        if discount > subtotal:
            raise FinanceError('descuento_global_invalido', 'El descuento global excede el subtotal.', 'invalid')
        total = money(subtotal - discount + tip)
        # Allocate global discount in exact cents; largest remainder, stable line order.
        allocations = [ZERO for _ in nets]
        if subtotal and discount:
            cents = int(discount * 100)
            shares = [Decimal(cents) * net / subtotal for net in nets]
            floors = [int(share.to_integral_value(rounding=ROUND_DOWN)) for share in shares]
            remaining = cents - sum(floors)
            order = sorted(range(len(nets)), key=lambda i: (-(shares[i] - floors[i]), i))
            for i in order[:remaining]:
                floors[i] += 1
            allocations = [Decimal(value) / 100 for value in floors]
        return {'subtotal': subtotal, 'descuento_global': discount, 'propina': tip,
                'total': total, 'netos_linea': nets, 'descuentos_globales_linea': allocations}


def commission(net_after_global, percentage):
    if percentage < 0 or percentage > 100:
        raise FinanceError('comision_invalida', 'Porcentaje de comision invalido.', 'invalid')
    return quantize(net_after_global * percentage / Decimal('100'))

