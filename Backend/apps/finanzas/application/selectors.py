from decimal import Decimal, localcontext
from django.db.models import Prefetch, Sum
from django.shortcuts import get_object_or_404
from apps.catalogo.selectors import integer_param, search
from apps.inventario.selectors import date_range
from apps.finanzas.domain.errors import FinanceError
from apps.finanzas.domain.money import ZERO, sale_totals, commission, quantize, COST_POLICY
from apps.finanzas.models import AdvanceApplication,Refund,SaleAdjustment
from negocio import models as m


def sum_amount(qs, field='monto'):
    return quantize(qs.aggregate(value=Sum(field))['value'] or ZERO)


def advance_amounts(advance):
    applied = sum_amount(AdvanceApplication.objects.filter(anticipo_id=advance.pk))
    refunded = sum_amount(Refund.objects.filter(anticipo_id=advance.pk))
    if advance.venta_id is not None:
        if applied:
            raise FinanceError('anticipo_legacy_ambiguo', 'El anticipo tiene vinculo antiguo y aplicaciones nuevas; requiere conciliacion.')
        applied = advance.monto if advance.estado == 'CONFIRMADO' else ZERO
    if applied+refunded > advance.monto:
        raise FinanceError('integridad_anticipo', 'Las aplicaciones exceden el monto original.')
    return {'aplicado':quantize(applied),'reembolsado':refunded,'disponible':quantize(advance.monto-applied-refunded if advance.estado=='CONFIRMADO' else ZERO)}


def balance_summary(sale):
    payments = sum_amount(m.Pagos.objects.filter(venta_id=sale.pk, estado='CONFIRMADO'))
    refunded=sum_amount(Refund.objects.filter(pago_id__in=m.Pagos.objects.filter(venta_id=sale.pk).values('id')))
    adjustments=sum_amount(SaleAdjustment.objects.filter(venta_id=sale.pk))
    applications = AdvanceApplication.objects.filter(venta_id=sale.pk)
    advance_ids = list(applications.values_list('anticipo_id', flat=True))
    if m.AnticiposCita.objects.filter(pk__in=advance_ids).exclude(estado='CONFIRMADO').exists():
        raise FinanceError('integridad_anticipo', 'Una aplicacion corresponde a un anticipo no confirmado.')
    legacy = m.AnticiposCita.objects.filter(venta_id=sale.pk, estado='CONFIRMADO')
    if payments and legacy.exists():
        raise FinanceError('anticipo_legacy_ambiguo', 'Pagos y vinculos antiguos de anticipo requieren conciliacion; no se infiere si hubo cobro duplicado.')
    if legacy.filter(pk__in=advance_ids).exists():
        raise FinanceError('anticipo_legacy_ambiguo', 'Vinculacion antigua y nueva superpuestas.')
    applied = sum_amount(applications) + sum_amount(legacy)
    covered = payments-refunded+applied
    if covered<0 or covered>sale.total-adjustments:
        raise FinanceError('integridad_saldo', 'Cobertura superior al total; requiere conciliacion.')
    return {'venta_id': sale.pk, 'estado': sale.estado, 'subtotal': sale.subtotal,
            'descuento_global': sale.descuento_global, 'propina': sale.propina, 'total': sale.total,
            'pagos_confirmados':payments,'reembolsos':refunded,'ajustes_comerciales':adjustments,'anticipos_aplicados':applied,
            'cobertura_total':covered,'saldo_pendiente':sale.total-adjustments-covered,'moneda':'PEN'}


def sale_lines(pk):
    return m.DetallesVenta.objects.filter(venta_id=pk).select_related('servicio', 'articulo__unidad', 'profesional').prefetch_related(
        Prefetch('consumosservicio_set', queryset=m.ConsumosServicio.objects.select_related('articulo__unidad').order_by('id'))).order_by('id')


def get_sale(pk):
    return get_object_or_404(m.Ventas.objects.select_related('visita').prefetch_related(
        Prefetch('detallesventa_set', queryset=sale_lines(pk))), pk=pk)


def visits(params):
    qs = m.Visitas.objects.select_related('clienta')
    for param, field in [('clienta', 'clienta_id'), ('llegada', 'llegada_id'), ('cita', 'citas__id')]:
        value = integer_param(params, param)
        if value is not None:
            qs = qs.filter(**{field: value})
    state = params.get('estado')
    if state is not None:
        if state not in ('ABIERTA', 'FINALIZADA', 'CANCELADA'):
            raise FinanceError('filtro_invalido', 'Estado de visita invalido.', 'invalid')
        qs = qs.filter(estado=state)
    return date_range(qs, params, 'inicio_en').order_by('-inicio_en', '-id')


def sales(params):
    qs = m.Ventas.objects.all()
    for param, field in [('clienta', 'clienta_id'), ('visita', 'visita_id')]:
        value = integer_param(params, param)
        if value is not None:
            qs = qs.filter(**{field: value})
    state = params.get('estado')
    if state is not None:
        if state not in ('BORRADOR', 'CONFIRMADA', 'ANULADA'):
            raise FinanceError('filtro_invalido', 'Estado de venta invalido.', 'invalid')
        qs = qs.filter(estado=state)
    return date_range(qs, params, 'creada_en').order_by('-creada_en', '-id')


def payments(params):
    qs = m.Pagos.objects.all()
    sale_id = integer_param(params, 'venta')
    if sale_id is not None:
        qs = qs.filter(venta_id=sale_id)
    state = params.get('estado')
    if state is not None:
        if state not in ('CONFIRMADO', 'ANULADO'):
            raise FinanceError('filtro_invalido', 'Estado de pago invalido.', 'invalid')
        qs = qs.filter(estado=state)
    return date_range(qs, params, 'pagado_en').order_by('-pagado_en', '-id')


def advances(params):
    qs = m.AnticiposCita.objects.all()
    appointment = integer_param(params, 'cita')
    if appointment is not None:
        qs = qs.filter(cita_id=appointment)
    state = params.get('estado')
    if state is not None:
        if state not in ('PENDIENTE', 'CONFIRMADO', 'ANULADO', 'REEMBOLSADO'):
            raise FinanceError('filtro_invalido', 'Estado de anticipo invalido.', 'invalid')
        qs = qs.filter(estado=state)
    return date_range(qs, params, 'creado_en').order_by('-creado_en', '-id')


def applicable_advances(sale):
    if not sale.visita_id:
        return m.AnticiposCita.objects.none()
    appointments = m.Citas.objects.filter(visita_id=sale.visita_id, clienta_id=sale.clienta_id).exclude(estado__in=['CANCELADA','EXPIRADA','NO_ASISTIO']).values('id')
    return m.AnticiposCita.objects.filter(cita_id__in=appointments, estado='CONFIRMADO').order_by('id')


def frozen_financials(sale, lines):
    with localcontext() as ctx:
        ctx.prec = 48
        totals = sale_totals([{'cantidad': row.cantidad, 'precio_unitario': row.precio_unitario,
                              'descuento_linea': row.descuento_linea} for row in lines], sale.descuento_global, sale.propina)
        direct = ZERO
        commissions = ZERO
        for i, line in enumerate(lines):
            if line.tipo == 'PRODUCTO':
                direct += line.cantidad * line.costo_unitario_snapshot
            else:
                direct += sum((row.cantidad * row.costo_unitario_snapshot for row in line.consumosservicio_set.all()), ZERO)
                commissions += commission(totals['netos_linea'][i] - totals['descuentos_globales_linea'][i], line.comision_porcentaje_snapshot)
        return {'costo_directo': quantize(direct), 'comisiones': quantize(commissions),
                'ingreso_sin_propina': sale.subtotal - sale.descuento_global,
                'margen_antes_gastos': quantize(sale.subtotal - sale.descuento_global - direct - commissions),
                'politica_costo': COST_POLICY}

