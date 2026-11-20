"""Public requests with private links and explicit staff confirmation; no email or SMS."""
from datetime import timedelta
from hashlib import sha256
import hmac
import json
import uuid
from django.conf import settings
from django.core.validators import URLValidator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import connection
from django.db.migrations.recorder import MigrationRecorder
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied, ValidationError
from apps.agenda.models import PublicBookingRequest, PublicBookingIntent
from apps.agenda.domain.commands import BookingCommand, AvailabilityQuery
from apps.agenda.domain.errors import AgendaError
from apps.agenda.domain.rules import ACTIVE, amounts, booking_duration
from apps.agenda.infrastructure import repositories as repo
from apps.agenda.infrastructure.transactions import agenda_transaction, ensure_ready
from apps.checkin.application.selectors import matching_clients, provisional
from apps.checkin.infrastructure.abuse_protection import consume
from apps.finanzas.infrastructure.idempotency import canonical
from negocio import models as m
from . import bookings, availability
from .common import set_state, system_audit


def installed():
    return MigrationRecorder(connection).migration_qs.filter(app='agenda', name='0002_public_booking').exists()


def holds():
    return PublicBookingRequest.objects.filter(estado='PENDIENTE', expira_en__gt=timezone.now())


def ready(new=False):
    ensure_ready()
    if not installed():
        raise AgendaError('PUBLIC_BOOKING_NOT_READY', 'Reservas online en preparación.', 'unavailable')
    if new and (not settings.AGENDA_PUBLIC_WRITE_ENABLED or not settings.AGENDA_PUBLIC_READ_ENABLED or not repo.config().reservas_online_activas):
        raise AgendaError('PUBLIC_BOOKING_DISABLED', 'Las solicitudes online están cerradas.', 'unavailable')


def notice():
    try:
        URLValidator(schemes=['https'])(settings.PRIVACY_NOTICE_URL)
        if not settings.PRIVACY_NOTICE_VERSION:
            raise DjangoValidationError('missing')
    except DjangoValidationError:
        raise AgendaError('PRIVACY_NOTICE_MISSING', 'Configura el aviso de privacidad HTTPS.', 'unavailable') from None
    return {'url': settings.PRIVACY_NOTICE_URL, 'version': settings.PRIVACY_NOTICE_VERSION}


def browser(request):
    if not request.session.get('booking_browser'):
        request.session['booking_browser'] = str(uuid.uuid4())
    return sha256(request.session['booking_browser'].encode()).hexdigest()


def management_code(row):
    digest = hmac.new(
        settings.SECRET_KEY.encode(),
        b'lasheo-public-booking-code-v1:' + row.management_token.bytes,
        sha256,
    ).digest()
    return f'{int.from_bytes(digest[:8], "big") % 100_000_000:08d}'


def management_code_hash(phone, code):
    value = f'lasheo-public-booking-access-v1:{phone}:{code}'.encode()
    return hmac.new(settings.SECRET_KEY.encode(), value, sha256).hexdigest()


def authorize_request(request, row):
    """Keep only explicitly authorized requests for the current contact."""
    ids=request.session.get('booking_requests', []) if request.session.get('booking_phone')==row.telefono else []
    request.session['booking_phone']=row.telefono
    request.session['booking_requests']=list(dict.fromkeys([str(row.pk),*ids]))[:50]


def authorized_requests(request):
    phone=request.session.get('booking_phone')
    if not phone:
        # Older browser sessions may contain requests belonging to several people.
        # Require their phone and code again instead of choosing an identity.
        request.session.pop('booking_requests',None)
        return PublicBookingRequest.objects.none()
    return PublicBookingRequest.objects.filter(telefono=phone,pk__in=request.session.get('booking_requests',[]))


def access(request, *, token=None, telefono=None, codigo=None):
    ready()
    if token:
        consume([('booking-access-ip', request.META.get('REMOTE_ADDR', ''), 20, 900)])
        row = PublicBookingRequest.objects.filter(management_token=token).first()
        if not row:
            raise AgendaError('BOOKING_NOT_FOUND', 'Enlace no disponible.', 'not_found')
    else:
        consume([
            ('booking-code-ip', request.META.get('REMOTE_ADDR', ''), 10, 900),
            ('booking-code-phone', telefono or '', 5, 900),
        ])
        digest = management_code_hash(telefono, codigo)
        row = PublicBookingRequest.objects.filter(
            telefono=telefono,
            management_code_hash=digest,
        ).first()
        if not row:
            raise AgendaError(
                'BOOKING_ACCESS_DENIED',
                'No pudimos validar el teléfono y la clave. Revísalos e intenta de nuevo.',
                'not_found',
            )
    authorize_request(request,row)
    return detail(row, customer=True)


def owned(request, pk):
    row = authorized_requests(request).filter(pk=pk).first()
    if not row:
        raise PermissionDenied('Ingresa el teléfono y la clave de acceso de esta solicitud.')
    return row


def detail(row, include_code=False, customer=False, staff=False):
    now = timezone.now()
    appointment = m.Citas.objects.select_related('profesional').filter(pk=row.appointment_id).first() if row.appointment_id else None
    state = appointment.estado if appointment else ('EXPIRADA' if row.estado == 'PENDIENTE' and row.expira_en <= now else row.estado)
    start, end = (appointment.inicio_en, appointment.fin_en) if appointment else (row.inicio_en, row.fin_en)
    cutoff = start - timedelta(hours=repo.config().horas_limite_cancelacion)
    editable = (state == 'PENDIENTE' and row.expira_en > now and start > now) or (appointment is not None and state in ACTIVE and not appointment.visita_id and now <= cutoff and start > now)
    result = {'id': str(row.pk), 'estado': state, 'cita_id': row.appointment_id,
        'codigo_reserva': appointment.codigo_reserva if appointment else str(row.pk)[:8].upper(),
        'inicio_en': start, 'fin_en': end, 'precio_total': appointment.precio_total if appointment else row.precio_total,
        'profesional': str(appointment.profesional.nombres if appointment else m.Profesionales.objects.get(pk=row.profesional_id).nombres),
        'servicios': list(appointment.citaservicios_set.order_by('orden').values('servicio_id','servicio__nombre','precio_snapshot','duracion_minutos')) if appointment else row.servicios,
        'expira_en': row.expira_en if state=='PENDIENTE' else None, 'motivo_publico': row.motivo_publico,
        'limite_cambios_en': cutoff, 'puede_cancelar': editable, 'puede_reprogramar': editable,
        'anticipo_requerido': appointment.anticipo_requerido if appointment else '0.00'}
    if include_code:
        result['management_code'] = management_code(row)
    if customer:
        result.update(nombres=row.nombres, apellidos=row.apellidos)
    if staff:
        result.update(nombres=row.nombres, apellidos=row.apellidos, telefono=row.telefono)
    return canonical(result)


def restore_intent(result):
    restored = dict(result)
    if restored.pop('_issue_management_code', False):
        row = PublicBookingRequest.objects.get(pk=restored['id'])
        restored['management_code'] = management_code(row)
    return restored


def mutate(request, key, operation, data, callback):
    ready(new=operation == 'crear')
    try:
        parsed = uuid.UUID(str(key))
    except (ValueError, TypeError, AttributeError):
        raise ValidationError('Idempotency-Key UUID obligatorio.') from None
    owner = browser(request)
    fingerprint = sha256(json.dumps(canonical({'operation': operation, 'data': data}), sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    with agenda_transaction():
        prior = PublicBookingIntent.objects.filter(owner_hash=owner, key=parsed).first()
        if prior:
            if prior.fingerprint != fingerprint:
                raise AgendaError('IDEMPOTENCY_CONFLICT', 'La referencia pertenece a otra operación.')
            return restore_intent(prior.result)
        result = canonical(callback())
        stored_result = result
        if operation == 'crear':
            stored_result = dict(result)
            stored_result.pop('management_code')
            stored_result['_issue_management_code'] = True
        PublicBookingIntent.objects.create(
            owner_hash=owner,
            key=parsed,
            fingerprint=fingerprint,
            result=stored_result,
        )
        return result


def create(request, data):
    if data['version_aviso'] != notice()['version']:
        raise ValidationError('El aviso cambió. Revísalo de nuevo.')
    consume([('booking-phone', data['telefono'], 3, 3600)])
    cfg = repo.config(lock=True)
    _, services = repo.eligible(data['profesional_id'], tuple(data['servicios']), public=True)
    total, duration, _ = amounts(services, cfg)
    end = data['inicio_en'] + timedelta(minutes=duration)
    bookings.validate_slot(data['profesional_id'], None, data['inicio_en'], end, cfg)
    if holds().filter(telefono=data['telefono']).count() >= 2:
        raise AgendaError('CLIENT_BOOKING_LIMIT', 'Ya hay solicitudes pendientes con este contacto.')
    row = PublicBookingRequest.objects.create(nombres=' '.join(data['nombres'].split()), apellidos=' '.join(data['apellidos'].split()),
        telefono=data['telefono'], profesional_id=data['profesional_id'], inicio_en=data['inicio_en'], fin_en=end,
        precio_total=total, duracion_minutos=duration,
        servicios=[{'servicio_id': item.pk, 'servicio__nombre': item.nombre, 'precio_snapshot': str(item.precio_base), 'duracion_minutos': item.duracion_minutos} for item in services],
        version_aviso=data['version_aviso'],
        expira_en=min(timezone.now() + timedelta(minutes=settings.AGENDA_REQUEST_HOLD_MINUTES), data['inicio_en']))
    while True:
        digest = management_code_hash(row.telefono, management_code(row))
        if not PublicBookingRequest.objects.filter(
            telefono=row.telefono,
            management_code_hash=digest,
        ).exists():
            break
        row.management_token = uuid.uuid4()
    row.management_code_hash = digest
    row.save(update_fields=['management_token', 'management_code_hash'])
    if settings.AGENDA_AUTO_CONFIRM_PUBLIC_BOOKINGS:
        client=client_for_booking(row)
        # Remove the temporary hold before creating the appointment under the same lock.
        row.estado='CONFIRMADA'
        row.save(update_fields=['estado'])
        result=bookings.create(BookingCommand(client.pk,row.profesional_id,tuple(item['servicio_id'] for item in row.servicios),row.inicio_en,origen='ONLINE'),None,public=True,quote=row.servicios)
        appointment=m.Citas.objects.get(pk=result['cita_id'])
        set_state(appointment,'CONFIRMADA',None,'Reserva online confirmada automaticamente en un cupo publicado.')
        row.appointment_id=appointment.pk
        row.save(update_fields=['appointment_id'])
        system_audit(row,'CONFIRMAR_RESERVA_WEB',{'cita_id':appointment.pk,'automatica':True,'contacto_verificado':False,'version_aviso':row.version_aviso})
    authorize_request(request,row)
    system_audit(row, 'SOLICITAR_RESERVA', {'contacto_verificado': False, 'version_aviso': row.version_aviso})
    return detail(row, include_code=True)


def change(request, pk, action, data):
    row = owned(request, pk)
    current = detail(row)
    if not current['puede_cancelar']:
        raise AgendaError('BOOKING_CHANGE_DEADLINE', 'Esta reserva ya no admite cambios online. Contacta al salón.')
    appointment = m.Citas.objects.select_for_update().filter(pk=row.appointment_id).first() if row.appointment_id else None
    if action == 'cancelar':
        if appointment:
            appointment.cancelada_en, appointment.cancelada_por, appointment.motivo_cancelacion = timezone.now(), 'CLIENTA', data['motivo']
            appointment.save(update_fields=['cancelada_en', 'cancelada_por', 'motivo_cancelacion'])
            set_state(appointment, 'CANCELADA', None, 'Cancelación desde acceso público de la clienta.')
        row.estado, row.motivo_publico = 'CANCELADA', data['motivo']
        row.save(update_fields=['estado', 'motivo_publico'])
    else:
        cfg = repo.config(lock=True)
        start = data['inicio_en']
        if appointment:
            row.profesional_id, row.duracion_minutos = appointment.profesional_id, appointment.duracion_total_minutos
            row.servicios = canonical(list(appointment.citaservicios_set.order_by('orden').values('servicio_id','servicio__nombre','precio_snapshot','duracion_minutos')))
        row.duracion_minutos = booking_duration(row.duracion_minutos)
        end = start + timedelta(minutes=row.duracion_minutos)
        # Temporarily remove this request's hold within the same transaction.
        old_state = row.estado
        row.estado = 'CAMBIANDO'
        row.save(update_fields=['estado'])
        repo.eligible(row.profesional_id, tuple(item['servicio_id'] for item in row.servicios), public=True)
        bookings.validate_slot(row.profesional_id, appointment.clienta_id if appointment else None, start, end, cfg, exclude=appointment.pk if appointment else None)
        if appointment:
            appointment.inicio_en, appointment.fin_en = start, end
            appointment.duracion_total_minutos = row.duracion_minutos
            appointment.save(update_fields=['inicio_en', 'fin_en', 'duracion_total_minutos'])
        row.inicio_en, row.fin_en, row.estado = start, end, old_state
        if not appointment:row.expira_en=min(row.expira_en,start)
        row.save(update_fields=['inicio_en', 'fin_en', 'estado','expira_en','profesional_id','duracion_minutos','servicios'])
    system_audit(row, 'CAMBIAR_RESERVA_WEB', {'accion': action})
    return detail(row, customer=True)


def client_for_booking(row,actor=None):
    ids = matching_clients(row.telefono)
    if len(ids) > 1:
        raise AgendaError('CONTACT_REVIEW_REQUIRED', 'Revisa las fichas duplicadas antes de confirmar.')
    if ids:
        client = m.Clientas.objects.select_for_update().get(pk=ids[0])
        if not client.activa or provisional(client):
            raise AgendaError('CONTACT_REVIEW_REQUIRED', 'Valida y activa la ficha desde recepción antes de confirmar.')
    else:
        client = m.Clientas.objects.create(nombres=row.nombres, apellidos=row.apellidos, telefono=row.telefono,
            activa=True, consentimiento_datos=True, consentimiento_fecha=timezone.now(), acepta_recordatorios=False, canal_preferido='EMAIL')
        system_audit(client, 'ALTA_RESERVA_REVISADA' if actor else 'ALTA_RESERVA_ONLINE',
            {'solicitud_id':str(row.pk),**({'responsable':actor.pk} if actor else {'contacto_verificado':False,'version_aviso':row.version_aviso})})
    return client


def approve(pk, actor):
    ready()
    row = get_object_or_404(PublicBookingRequest.objects.select_for_update(),pk=pk)
    if row.estado != 'PENDIENTE' or row.expira_en <= timezone.now():
        raise AgendaError('REQUEST_NOT_PENDING', 'La solicitud ya fue resuelta o venció.')
    client=client_for_booking(row,actor)
    row.estado = 'CONFIRMADA'
    row.save(update_fields=['estado'])
    # Use the immutable public quote, even if the catalogue price changed during review.
    result = bookings.create(BookingCommand(client.pk, row.profesional_id, tuple(item['servicio_id'] for item in row.servicios), row.inicio_en, origen='ONLINE'), actor, public=True, quote=row.servicios)
    appointment = m.Citas.objects.get(pk=result['cita_id'])
    row.appointment_id = appointment.pk
    row.save(update_fields=['appointment_id'])
    system_audit(row, 'APROBAR_RESERVA', {'responsable': actor.pk, 'identidad_verificada': True, 'consentimiento_verificado': True})
    return detail(row, staff=True)


def slots(request, pk, day):
    row = owned(request, pk)
    if not detail(row)['puede_reprogramar']:
        raise AgendaError('BOOKING_CHANGE_DEADLINE', 'La solicitud ya no admite cambios.')
    info = detail(row)
    professional_id = m.Citas.objects.get(pk=row.appointment_id).profesional_id if row.appointment_id else row.profesional_id
    query = AvailabilityQuery(professional_id, tuple(item['servicio_id'] for item in info['servicios']), day,
        cita_id=row.appointment_id, request_id=str(row.pk))
    return canonical(availability.available(query))


def reject(pk, reason, actor):
    row = get_object_or_404(PublicBookingRequest.objects.select_for_update(),pk=pk)
    if row.estado != 'PENDIENTE' or row.expira_en <= timezone.now():
        raise AgendaError('REQUEST_NOT_PENDING', 'La solicitud ya fue resuelta o venció.')
    row.estado, row.motivo_publico = 'RECHAZADA', reason
    row.save(update_fields=['estado', 'motivo_publico'])
    system_audit(row, 'RECHAZAR_RESERVA', {'responsable': actor.pk})
    return detail(row, staff=True)

