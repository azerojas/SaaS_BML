from django.shortcuts import get_object_or_404
from django.utils import timezone
from apps.checkin.application import commands as checkin_commands
from apps.checkin.application.selectors import provisional
from apps.finanzas.domain.errors import FinanceError
from negocio import models as m
from .audit import record


def open_visit(data, actor):
    client = get_object_or_404(m.Clientas.objects.select_for_update(), pk=data['clienta_id'])
    if not client.activa or provisional(client):
        raise FinanceError('clienta_no_validada', 'Se requiere ficha activa y validada presencialmente cuando proceda.')
    arrival_id = data.get('llegada_id')
    if arrival_id is not None:
        arrival = get_object_or_404(m.Llegadas.objects.select_for_update(), pk=arrival_id)
        if arrival.clienta_id != client.pk or arrival.estado != 'CONFIRMADA':
            raise FinanceError('llegada_incompatible', 'La llegada debe estar confirmada y pertenecer a la misma clienta.')
        if m.Visitas.objects.filter(llegada_id=arrival.pk).exists():
            raise FinanceError('llegada_usada', 'La llegada ya tiene una visita.')
        obj = checkin_commands.create_visit(arrival.pk, actor)
        if 'notas' in data:
            obj.notas = data['notas']
            obj.save(update_fields=['notas'])
    else:
        obj = m.Visitas.objects.create(clienta_id=client.pk, creada_por_id=actor.pk, notas=data.get('notas'))
        record(actor, obj, 'ABRIR_VISITA', {'origen': 'MANUAL'})
    if data.get('cita_id'):
        link_appointment(obj, data['cita_id'], actor)
    return {'visita_id': obj.pk, 'estado': obj.estado}


def link_appointment(visit, appointment_id, actor):
    ap = get_object_or_404(m.Citas.objects.select_for_update(), pk=appointment_id)
    if ap.clienta_id != visit.clienta_id or ap.estado not in ('PROGRAMADA', 'CONFIRMADA') or ap.visita_id is not None:
        raise FinanceError('cita_incompatible', 'La cita no es compatible o ya esta asociada.')
    if m.Citas.objects.filter(visita_id=visit.pk).exists():
        raise FinanceError('cita_incompatible', 'La visita ya tiene una cita.')
    ap.visita_id = visit.pk
    ap.save(update_fields=['visita_id'])
    record(actor, ap, 'ENLAZAR_VISITA', {'visita_id': visit.pk})


def update_notes(pk, data, actor):
    obj = get_object_or_404(m.Visitas.objects.select_for_update(), pk=pk)
    if obj.estado != 'ABIERTA':
        raise FinanceError('estado_visita', 'Solo se editan notas de visitas abiertas.')
    obj.notas = data['notas']
    obj.save(update_fields=['notas'])
    record(actor, obj, 'EDITAR_NOTAS', {'campos': ['notas']})
    return {'visita_id': obj.pk, 'estado': obj.estado}


def resolve_visit(pk, action, actor, reason=None):
    obj = get_object_or_404(m.Visitas.objects.select_for_update(), pk=pk)
    if obj.estado != 'ABIERTA':
        raise FinanceError('estado_visita', 'La visita ya esta resuelta.')
    sale = m.Ventas.objects.select_for_update().filter(visita_id=obj.pk).first()
    if action == 'cancelar':
        if sale and sale.estado != 'ANULADA':
            raise FinanceError('venta_vigente', 'Resuelve la venta antes de cancelar la visita.')
        obj.estado = 'CANCELADA'
    else:
        if sale is None or sale.estado != 'CONFIRMADA':
            raise FinanceError('venta_no_confirmada', 'La finalizacion requiere venta confirmada.')
        obj.estado = 'FINALIZADA'
    obj.fin_en = timezone.now()
    obj.save(update_fields=['estado', 'fin_en'])
    record(actor, obj, 'CANCELAR_VISITA' if action == 'cancelar' else 'FINALIZAR_VISITA', {'motivo': reason} if reason else {})
    return {'visita_id': obj.pk, 'estado': obj.estado}

