from functools import wraps
from django.conf import settings
from django.db import IntegrityError, connection, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError
from apps.catalogo.services import CatalogConflict
from apps.checkin.domain.rules import cutoff, require_pending
from negocio import models as m
from . import selectors


def checkin_write(function):
    @wraps(function)
    def run(*args, **kwargs):
        try:
            with transaction.atomic():
                # Same lock as phase-1 normalized-phone writes; no mass normalization.
                with connection.cursor() as cursor:
                    cursor.execute('SELECT pg_advisory_xact_lock(718302451)')
                return function(*args, **kwargs)
        except IntegrityError as exc:
            if getattr(exc.__cause__, 'sqlstate', '') == '23505':
                raise CatalogConflict('Ya existe una llegada pendiente o una visita asociada.', 'duplicado_checkin') from None
            raise
    return run


def audit(user, obj, action, data):
    m.Auditoria.objects.create(usuario_id=user.pk if user else None, entidad=obj._meta.db_table,
        entidad_id=str(obj.pk), accion=action, datos=data, creada_en=timezone.now())


def active_point(token, lock=False):
    qs = m.PuntosQr.objects.select_for_update() if lock else m.PuntosQr.objects.all()
    point = qs.filter(token=token, activo=True).first()
    if point is None:
        raise NotFound('Punto no disponible.')
    return point


@transaction.atomic
def save_point(data, user, pk=None):
    obj = get_object_or_404(m.PuntosQr.objects.select_for_update(), pk=pk) if pk else None
    if obj:
        for field, value in data.items():
            setattr(obj, field, value)
        if data:
            obj.save(update_fields=list(data))
        action = 'MODIFICAR'
    else:
        obj = m.PuntosQr.objects.create(**data)
        action = 'CREAR'
    obj.refresh_from_db()
    audit(user, obj, action, {'campos': sorted(data)})
    return obj


def current_notice():
    return bool(settings.CHECKIN_PRIVACY_NOTICE_URL and settings.CHECKIN_PRIVACY_NOTICE_VERSION)


@checkin_write
def request_arrival(token, data):
    point = active_point(token, lock=True)
    ids = selectors.matching_clients(data['telefono'])
    if len(ids) > 1:
        return
    if ids:
        client = m.Clientas.objects.select_for_update().get(pk=ids[0])
        if not client.activa and not selectors.provisional(client):
            return
        if selectors.provisional(client) and data.get('consentimiento_datos') and current_notice() and data.get('version_aviso') == settings.CHECKIN_PRIVACY_NOTICE_VERSION:
            audit(None, client, 'DECLARAR_CONSENT_QR', {'version_aviso': data['version_aviso'], 'consentimiento_declarado': True})
    else:
        if not all(data.get(key) for key in ('nombres', 'apellidos', 'consentimiento_datos')):
            return
        if not current_notice() or data.get('version_aviso') != settings.CHECKIN_PRIVACY_NOTICE_VERSION:
            return
        client = m.Clientas.objects.create(nombres=data['nombres'], apellidos=data['apellidos'],
            telefono=data['telefono'], activa=False, consentimiento_datos=False,
            consentimiento_fecha=None, acepta_recordatorios=False, canal_preferido='EMAIL')
        audit(None, client, 'ALTA_QR_PROVISIONAL', {'version_aviso': data['version_aviso'],
            'consentimiento_declarado': True, 'identidad_verificada': False})
    if m.Llegadas.objects.filter(clienta_id=client.pk, estado='PENDIENTE').exists():
        return
    arrival = m.Llegadas.objects.create(clienta_id=client.pk, punto_qr_id=point.pk, origen='QR')
    audit(None, arrival, 'SOLICITAR', {'verificacion_presencial_pendiente': True})


def lock_arrival(pk):
    snapshot = get_object_or_404(m.Llegadas.objects.only('clienta_id'), pk=pk)
    client = get_object_or_404(m.Clientas.objects.select_for_update(), pk=snapshot.clienta_id)
    arrival = get_object_or_404(m.Llegadas.objects.select_for_update(), pk=pk)
    return client, arrival


@checkin_write
def register_visit(token, data):
    """Self-service QR registration; an open visit is reused across QR points."""
    point = active_point(token, lock=True)
    ids = selectors.matching_clients(data['telefono'])
    if len(ids) > 1:
        return
    declared = (data.get('consentimiento_datos') is True and current_notice()
                and data.get('version_aviso') == settings.CHECKIN_PRIVACY_NOTICE_VERSION)
    now = timezone.now()
    if ids:
        client = m.Clientas.objects.select_for_update().get(pk=ids[0])
        if selectors.provisional(client):
            if not declared:
                return
            client.activa = True
            client.consentimiento_datos = True
            client.consentimiento_fecha = now
            client.save(update_fields=['activa', 'consentimiento_datos', 'consentimiento_fecha'])
            audit(None, client, 'ACTIVAR_ALTA_QR_AUTONOMA', {
                'version_aviso': data['version_aviso'], 'consentimiento_declarado': True,
                'identidad_verificada': False})
        elif not client.activa:
            return
    else:
        if not declared or not all(data.get(key) for key in ('nombres', 'apellidos')):
            return
        client = m.Clientas.objects.create(
            nombres=data['nombres'], apellidos=data['apellidos'], telefono=data['telefono'],
            activa=True, consentimiento_datos=True, consentimiento_fecha=now,
            acepta_recordatorios=False, canal_preferido='EMAIL')
        audit(None, client, 'ALTA_QR_AUTONOMA', {
            'version_aviso': data['version_aviso'], 'consentimiento_declarado': True,
            'identidad_verificada': False})

    existing = m.Visitas.objects.select_for_update().filter(
        clienta_id=client.pk, estado='ABIERTA').order_by('id').first()
    if existing:
        return existing

    arrival = m.Llegadas.objects.select_for_update().filter(
        clienta_id=client.pk, estado='PENDIENTE').first()
    if arrival:
        arrival.estado = 'CONFIRMADA'
        arrival.confirmada_en = now
        arrival.confirmada_por_id = None
        arrival.save(update_fields=['estado', 'confirmada_en', 'confirmada_por_id'])
    else:
        arrival = m.Llegadas.objects.create(
            clienta_id=client.pk, punto_qr_id=point.pk, origen='QR',
            estado='CONFIRMADA', confirmada_en=now)
    audit(None, arrival, 'REGISTRAR_QR_AUTOMATICO', {
        'punto_qr_id': point.pk, 'identidad_verificada': False})
    visit = m.Visitas.objects.create(clienta_id=client.pk, llegada_id=arrival.pk)
    audit(None, visit, 'INICIAR_VISITA_QR', {'llegada_id': arrival.pk})
    return visit


@checkin_write
def manual_arrival(client_id, user):
    client = get_object_or_404(m.Clientas.objects.select_for_update(), pk=client_id)
    if not client.activa or selectors.provisional(client):
        raise CatalogConflict('La ficha debe estar activa y validada.', 'clienta_no_validada')
    if m.Llegadas.objects.filter(clienta_id=client.pk, estado='PENDIENTE').exists():
        raise CatalogConflict('La clienta ya tiene una llegada pendiente.', 'duplicado_checkin')
    obj = m.Llegadas.objects.create(clienta_id=client.pk, origen='MANUAL')
    audit(user, obj, 'SOLICITAR', {'origen': 'MANUAL'})
    return obj.pk


@checkin_write
def confirm_arrival(pk, data, user):
    client, obj = lock_arrival(pk)
    require_pending(obj)
    if not data['identidad_verificada']:
        raise ValidationError({'identidad_verificada': 'Confirma presencialmente la identidad.'})
    if selectors.provisional(client):
        evidence = m.Auditoria.objects.filter(entidad='clientas', entidad_id=str(client.pk), accion__in=['ALTA_QR_PROVISIONAL', 'DECLARAR_CONSENT_QR']).order_by('-id').first()
        if not data.get('consentimiento_verificado') or not current_notice() or evidence.datos.get('version_aviso') != settings.CHECKIN_PRIVACY_NOTICE_VERSION:
            raise ValidationError({'consentimiento_verificado': 'Verifica presencialmente el consentimiento y el aviso vigente.'})
        client.activa, client.consentimiento_datos, client.consentimiento_fecha = True, True, timezone.now()
        client.save(update_fields=['activa', 'consentimiento_datos', 'consentimiento_fecha'])
        audit(user, client, 'VALIDAR_ALTA_QR', {'version_aviso': settings.CHECKIN_PRIVACY_NOTICE_VERSION,
            'identidad_verificada': True, 'consentimiento_verificado': True})
    elif not client.activa:
        raise CatalogConflict('La ficha esta inactiva.', 'clienta_inactiva')
    obj.estado, obj.confirmada_en, obj.confirmada_por_id = 'CONFIRMADA', timezone.now(), user.pk
    obj.save(update_fields=['estado', 'confirmada_en', 'confirmada_por_id'])
    audit(user, obj, 'CONFIRMAR', {'identidad_verificada': True, 'motivo': data.get('motivo', '')})


@checkin_write
def resolve_arrival(pk, target, data, user):
    _, obj = lock_arrival(pk)
    require_pending(obj, allow_expired=True)
    obj.estado = target
    obj.save(update_fields=['estado'])
    audit(user, obj, 'RECHAZAR' if target == 'RECHAZADA' else 'CANCELAR', {'motivo': data.get('motivo', '')})


@checkin_write
def expire_one(pk, user=None):
    _, obj = lock_arrival(pk)
    if obj.estado != 'PENDIENTE' or obj.solicitada_en >= cutoff():
        return False
    obj.estado = 'CANCELADA'
    obj.save(update_fields=['estado'])
    audit(user, obj, 'EXPIRAR', {'motivo': 'Vencimiento por politica de recepcion.'})
    return True


def expire_pending(limit=200, user=None):
    ids = list(m.Llegadas.objects.filter(estado='PENDIENTE', solicitada_en__lt=cutoff()).order_by('id').values_list('id', flat=True)[:limit])
    return sum(expire_one(pk, user) for pk in ids)


def confirmed_client(pk):
    client, arrival = lock_arrival(pk)
    if arrival.estado != 'CONFIRMADA' or not client.activa or selectors.provisional(client):
        raise CatalogConflict('Se requiere llegada confirmada y ficha activa validada.', 'llegada_no_confirmada')
    return client, arrival


@checkin_write
def create_visit(pk, user):
    client, arrival = confirmed_client(pk)
    existing = m.Visitas.objects.filter(llegada_id=arrival.pk).first()
    if existing:
        if existing.clienta_id != client.pk:
            raise CatalogConflict('La visita existente pertenece a otra ficha.', 'clienta_incompatible')
        return existing
    obj = m.Visitas.objects.create(clienta_id=client.pk, llegada_id=arrival.pk, creada_por_id=user.pk)
    audit(user, obj, 'INICIAR_VISITA', {'llegada_id': arrival.pk})
    return obj


@checkin_write
def associate_visit(pk, visit_id, user):
    client, arrival = confirmed_client(pk)
    obj = get_object_or_404(m.Visitas.objects.select_for_update(), pk=visit_id)
    if obj.clienta_id != client.pk or obj.estado != 'ABIERTA':
        raise CatalogConflict('La visita debe estar abierta y pertenecer a la misma clienta.', 'clienta_incompatible')
    if obj.llegada_id is not None and obj.llegada_id != arrival.pk:
        raise CatalogConflict('La visita ya tiene llegada.', 'visita_asociada')
    if m.Visitas.objects.filter(llegada_id=arrival.pk).exclude(pk=obj.pk).exists():
        raise CatalogConflict('La llegada ya tiene otra visita.', 'visita_asociada')
    obj.llegada_id = arrival.pk
    obj.save(update_fields=['llegada_id'])
    audit(user, obj, 'ASOCIAR_LLEGADA', {'llegada_id': arrival.pk})
    return obj


@checkin_write
def link_appointment(pk, appointment_id, user):
    client, arrival = confirmed_client(pk)
    visit = get_object_or_404(m.Visitas.objects.select_for_update(), llegada_id=arrival.pk)
    appointment = get_object_or_404(m.Citas.objects.select_for_update(), pk=appointment_id)
    if visit.estado != 'ABIERTA' or visit.clienta_id != client.pk or appointment.clienta_id != client.pk:
        raise CatalogConflict('La cita y visita deben corresponder a la misma ficha.', 'cita_incompatible')
    if appointment.visita_id == visit.pk:
        return visit
    if appointment.visita_id is not None or not selectors.appointment_candidates(client.pk).filter(pk=appointment.pk).exists():
        raise CatalogConflict('La cita no esta activa, compatible o disponible para asociacion.', 'cita_incompatible')
    if m.Citas.objects.filter(visita_id=visit.pk).exists():
        raise CatalogConflict('La visita ya esta vinculada a otra cita.', 'cita_incompatible')
    appointment.visita_id = visit.pk
    appointment.save(update_fields=['visita_id'])
    audit(user, appointment, 'ENLAZAR_VISITA', {'visita_id': visit.pk, 'llegada_id': arrival.pk})
    return visit

