from datetime import datetime,timedelta
from django.conf import settings
from django.utils import timezone
from django.db.models import Q
from django.shortcuts import get_object_or_404
from negocio import models as m
from apps.agenda.domain.errors import AgendaError
from apps.agenda.domain.rules import ZONE,ACTIVE,amounts,overlaps,booking_duration
from apps.agenda.infrastructure import repositories as repo


def available(query):
    cfg=repo.config()
    if query.public and (not settings.AGENDA_PUBLIC_READ_ENABLED or not cfg.reservas_online_activas):
        raise AgendaError('BOOKING_NOT_AVAILABLE','Consulta no disponible.','not_found')
    _,services=repo.eligible(query.profesional_id,query.servicios,query.public)
    now=timezone.now()
    appointment=None
    if query.cita_id:
        appointment=get_object_or_404(repo.appointments(),pk=query.cita_id)
        if query.public or appointment.estado not in ACTIVE or appointment.visita_id or appointment.inicio_en<=now or appointment.estado=='PENDIENTE_PAGO' and appointment.expira_en<=now:
            raise AgendaError('APPOINTMENT_NOT_EDITABLE','La cita no admite reprogramacion.')
        if set(query.servicios)!={row.servicio_id for row in appointment.citaservicios_set.all()} or not appointment.duracion_total_minutos:
            raise AgendaError('SNAPSHOT_MISMATCH','La consulta debe conservar los servicios historicos.','invalid')
        total,duration,required=appointment.precio_total,appointment.duracion_total_minutos,appointment.anticipo_requerido
    else:total,duration,required=amounts(services,cfg)
    if query.request_id and not appointment:
        from apps.agenda.models import PublicBookingRequest
        request_quote=PublicBookingRequest.objects.get(pk=query.request_id)
        total,duration,required=request_quote.precio_total,request_quote.duracion_minutos,0
    duration=booking_duration(duration)
    day_start=datetime.combine(query.fecha,datetime.min.time(),ZONE)
    day_end=day_start+timedelta(days=1)
    if query.fecha<now.astimezone(ZONE).date() or day_start>=now+timedelta(days=min(cfg.anticipacion_maxima_dias,366)):
        raise AgendaError('BOOKING_OUTSIDE_WINDOW','Fecha fuera del horizonte de reservas.','invalid')
    owner=Q(profesional_id=query.profesional_id)
    if appointment:owner|=Q(clienta_id=appointment.clienta_id)
    appointments=list(m.Citas.objects.filter(owner,estado__in=ACTIVE,inicio_en__lt=day_end,fin_en__gt=day_start).exclude(pk=query.cita_id).values_list('inicio_en','fin_en','profesional_id'))
    occupied=[(start,end) for start,end,identifier in appointments if identifier==query.profesional_id]
    client_occupied=[(start,end) for start,end,identifier in appointments if identifier!=query.profesional_id]
    occupied+=list(m.BloqueosAgenda.objects.filter(Q(profesional_id=query.profesional_id)|Q(profesional_id=None),inicio_en__lt=day_end,fin_en__gt=day_start).values_list('inicio_en','fin_en'))
    from .public_booking import installed,holds
    if installed():
        occupied+=list(holds().filter(profesional_id=query.profesional_id,inicio_en__lt=day_end,fin_en__gt=day_start).exclude(pk=query.request_id).values_list('inicio_en','fin_en'))
    slots=[]
    for day,begin,end,single in repo.booking_windows(query.profesional_id,query.fecha):
        if day!=query.fecha.isoweekday():continue
        start=datetime.combine(query.fecha,begin,ZONE)
        bound=datetime.combine(query.fecha,end,ZONE)
        while start+timedelta(minutes=duration)<=bound:
            finish=start+timedelta(minutes=duration)
            reserved_end=bound if single else finish
            if now+timedelta(minutes=cfg.anticipacion_minima_minutos)<=start<now+timedelta(days=min(cfg.anticipacion_maxima_dias,366)) and not any(overlaps(start,reserved_end,a,b) for a,b in occupied) and not any(overlaps(start,finish,a,b) for a,b in client_occupied):
                slots.append({'inicio_en':start,'fin_en':finish})
            if single:
                break
            start+=timedelta(minutes=cfg.intervalo_slots_minutos)
    return {'timezone':'America/Lima','fecha_local':query.fecha,'profesional_id':query.profesional_id,'servicios':list(query.servicios),
            'duracion_minutos':duration,'cupo_minutos':settings.AGENDA_BOOKING_SLOT_MINUTES,'precio_total':total,'anticipo_requerido':required,'slots':slots,
            'disponibilidad_es_propuesta':True,'pendientes_vencidas_ocupan_hasta_expirar':True}
