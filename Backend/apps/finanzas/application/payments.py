from django.shortcuts import get_object_or_404
from negocio import models as m
from apps.finanzas.domain.errors import FinanceError
from . import selectors
from .audit import record


def ensure_reference_available(method, reference, excluding_payment=None, excluding_advance=None):
    if not reference:
        if method != 'EFECTIVO':
            raise FinanceError('referencia_requerida', 'Los medios no efectivos requieren referencia de operacion.', 'invalid')
        return
    payments = m.Pagos.objects.filter(metodo=method, referencia=reference, estado='CONFIRMADO')
    advances = m.AnticiposCita.objects.filter(metodo=method, referencia=reference, estado='CONFIRMADO')
    if excluding_payment is not None:
        payments = payments.exclude(pk=excluding_payment)
    if excluding_advance is not None:
        advances = advances.exclude(pk=excluding_advance)
    if payments.exists() or advances.exists():
        raise FinanceError('referencia_duplicada', 'La referencia ya corresponde a un cobro efectivo.')


def register_payment(sale_id, data, actor):
    sale = get_object_or_404(m.Ventas.objects.select_for_update(), pk=sale_id)
    if sale.estado != 'CONFIRMADA':
        raise FinanceError('venta_no_confirmada', 'Solo se cobra una venta confirmada.')
    if data['verificado_manualmente'] is not True:
        raise FinanceError('verificacion_requerida', 'Confirma manualmente el cobro.', 'invalid')
    summary = selectors.balance_summary(sale)
    if data['monto'] > summary['saldo_pendiente']:
        raise FinanceError('sobrepago', 'El monto supera el saldo pendiente.')
    reference = data.get('referencia') or None
    ensure_reference_available(data['metodo'], reference)
    obj = m.Pagos.objects.create(venta_id=sale.pk, metodo=data['metodo'], monto=data['monto'],
                                 referencia=reference, registrado_por_id=actor.pk)
    obj.refresh_from_db()
    record(actor, obj, 'REGISTRAR_PAGO', {'venta_id': sale.pk, 'monto': str(obj.monto), 'verificacion': 'MANUAL'})
    return {'pago_id': obj.pk, **selectors.balance_summary(sale)}


def void_payment(pk, data, actor):
    snapshot = get_object_or_404(m.Pagos.objects.only('venta_id'), pk=pk)
    sale = get_object_or_404(m.Ventas.objects.select_for_update(), pk=snapshot.venta_id)
    obj = get_object_or_404(m.Pagos.objects.select_for_update(), pk=pk)
    from apps.finanzas.models import Refund
    if Refund.objects.filter(pago_id=pk).exists():
        raise FinanceError('pago_con_reembolso','No se anula un pago con devoluciones registradas.')
    if obj.estado != 'CONFIRMADO':
        raise FinanceError('estado_pago', 'El pago ya fue anulado.')
    if data['error_registro_confirmado'] is not True:
        raise FinanceError('reembolso_no_soportado', 'Esta accion corrige un registro; no devuelve dinero.')
    obj.estado = 'ANULADO'
    obj.save(update_fields=['estado'])
    record(actor, obj, 'ANULAR_PAGO', {'venta_id': sale.pk, 'motivo': data['motivo'], 'reembolso_real': False})
    return {'pago_id': obj.pk, 'estado_pago': obj.estado, **selectors.balance_summary(sale)}

