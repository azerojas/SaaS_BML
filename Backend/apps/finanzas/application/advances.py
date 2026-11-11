from django.shortcuts import get_object_or_404
from django.utils import timezone
from negocio import models as m
from apps.finanzas.models import AdvanceApplication
from apps.finanzas.domain.errors import FinanceError
from . import selectors
from .audit import record
from .payments import ensure_reference_available


def create_advance(data, actor):
    appointment = get_object_or_404(m.Citas.objects.select_for_update(), pk=data['cita_id'])
    if appointment.estado not in ('PROGRAMADA', 'CONFIRMADA', 'PENDIENTE_PAGO'):
        raise FinanceError('cita_incompatible', 'La cita no admite nuevos anticipos.')
    obj = m.AnticiposCita.objects.create(cita_id=appointment.pk, metodo=data['metodo'], monto=data['monto'],
                                       referencia=data.get('referencia') or None, registrado_por_id=actor.pk)
    obj.refresh_from_db()
    record(actor, obj, 'CREAR_ANTICIPO', {'cita_id': appointment.pk, 'monto': str(obj.monto)})
    return {'anticipo_id': obj.pk, 'estado': obj.estado, 'monto': obj.monto}


def confirm_advance(pk, data, actor):
    obj = get_object_or_404(m.AnticiposCita.objects.select_for_update(), pk=pk)
    if obj.estado != 'PENDIENTE':
        raise FinanceError('estado_anticipo', 'Solo se confirma un anticipo pendiente.')
    if data['verificado_manualmente'] is not True:
        raise FinanceError('verificacion_requerida', 'Confirma manualmente el ingreso de dinero.', 'invalid')
    appointment = get_object_or_404(m.Citas.objects.select_for_update(), pk=obj.cita_id)
    from apps.agenda.application.advance_policy import before_confirmation, after_confirmation
    before_confirmation(appointment)
    if appointment.estado not in ('PROGRAMADA', 'CONFIRMADA', 'PENDIENTE_PAGO'):
        raise FinanceError('cita_incompatible', 'La cita ya no admite confirmar anticipo.')
    total = selectors.sum_amount(m.AnticiposCita.objects.filter(cita_id=obj.cita_id, estado='CONFIRMADO'))
    if total + obj.monto > appointment.precio_total:
        raise FinanceError('anticipo_excesivo', 'Los anticipos confirmados superarian el precio de la cita.')
    obj.metodo = data.get('metodo', obj.metodo)
    obj.referencia = data.get('referencia', obj.referencia)
    ensure_reference_available(obj.metodo, obj.referencia, excluding_advance=obj.pk)
    obj.estado, obj.pagado_en = 'CONFIRMADO', timezone.now()
    obj.save(update_fields=['estado', 'pagado_en', 'metodo', 'referencia'])
    after_confirmation(appointment, total + obj.monto, actor)
    record(actor, obj, 'CONFIRMAR_ANTICIPO', {'monto': str(obj.monto), 'verificacion': 'MANUAL'})
    return {'anticipo_id': obj.pk, 'estado': obj.estado, 'monto': obj.monto, **selectors.advance_amounts(obj)}


def cancel_advance(pk, data, actor):
    obj = get_object_or_404(m.AnticiposCita.objects.select_for_update(), pk=pk)
    if obj.estado != 'PENDIENTE':
        raise FinanceError('reembolso_no_soportado', 'Solo se anula un anticipo pendiente; un cobro requiere reembolso trazable.')
    obj.estado = 'ANULADO'
    obj.save(update_fields=['estado'])
    record(actor, obj, 'ANULAR_ANTICIPO', {'motivo': data['motivo']})
    return {'anticipo_id': obj.pk, 'estado': obj.estado}


def apply_advance(sale_id, data, actor, operation_key):
    sale = get_object_or_404(m.Ventas.objects.select_for_update(), pk=sale_id)
    if sale.estado != 'CONFIRMADA' or sale.visita_id is None:
        raise FinanceError('venta_incompatible', 'Aplicacion requiere venta confirmada vinculada a una visita y cita.')
    obj = get_object_or_404(m.AnticiposCita.objects.select_for_update(), pk=data['anticipo_id'])
    if obj.estado != 'CONFIRMADO' or obj.venta_id is not None:
        raise FinanceError('anticipo_no_disponible', 'El anticipo no esta confirmado o tiene vinculacion antigua.')
    appointment = get_object_or_404(m.Citas.objects.select_for_update(), pk=obj.cita_id)
    if appointment.estado in ('CANCELADA', 'EXPIRADA', 'NO_ASISTIO'):
        raise FinanceError('cita_incompatible', 'No se aplica anticipo de una cita cancelada, expirada o no atendida.')
    if appointment.visita_id != sale.visita_id or appointment.clienta_id != sale.clienta_id:
        raise FinanceError('anticipo_incompatible', 'La cita, visita y venta deben corresponder a la misma atencion y clienta.')
    amounts = selectors.advance_amounts(obj)
    summary = selectors.balance_summary(sale)
    if data['monto'] > amounts['disponible'] or data['monto'] > summary['saldo_pendiente']:
        raise FinanceError('aplicacion_excesiva', 'La aplicacion supera el anticipo disponible o el saldo de la venta.')
    application = AdvanceApplication.objects.create(anticipo_id=obj.pk, venta_id=sale.pk, monto=data['monto'],
        clave_operacion=operation_key, creado_por_id=actor.pk)
    # Application is coverage of an earlier cash event, never another pagos row.
    record(actor, obj, 'APLICAR_ANTICIPO', {'aplicacion_id': application.pk, 'venta_id': sale.pk, 'monto': str(data['monto'])})
    return {'aplicacion_id': application.pk, 'anticipo_id': obj.pk, **selectors.balance_summary(sale)}

