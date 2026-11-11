from datetime import datetime,timedelta
from django.conf import settings
from django.utils import timezone
from django.db.models import Q
from negocio import models as m
from apps.agenda.domain.errors import AgendaError
from apps.agenda.domain.rules import ZONE,ACTIVE,amounts,overlaps
from apps.agenda.infrastructure import repositories as repo


def available(query):
    cfg=repo.config()
    if query.public and (not settings.AGENDA_PUBLIC_READ_ENABLED or not cfg.reservas_online_activas):
        raise AgendaError('BOOKING_NOT_AVAILABLE','Consulta no disponible.','not_found')
    _,services=repo.eligible(query.profesional_id,query.servicios,query.public)
    total,duration,required=amounts(services,cfg)
    now=timezone.now()
    day_start=datetime.combine(query.fecha,datetime.min.time(),ZONE)
    day_end=day_start+timedelta(days=1)
    if query.fecha<now.astimezone(ZONE).date() or day_start>=now+timedelta(days=min(cfg.anticipacion_maxima_dias,366)):
        raise AgendaError('BOOKING_OUTSIDE_WINDOW','Fecha fuera del horizonte de reservas.','invalid')
    occupied=list(m.Citas.objects.filter(profesional_id=query.profesional_id,estado__in=ACTIVE,inicio_en__lt=day_end,fin_en__gt=day_start).values_list('inicio_en','fin_en'))
    occupied+=list(m.BloqueosAgenda.objects.filter(Q(profesional_id=query.profesional_id)|Q(profesional_id=None),inicio_en__lt=day_end,fin_en__gt=day_start).values_list('inicio_en','fin_en'))
    slots=[]
    for day,begin,end in repo.hours(query.profesional_id):
        if day!=query.fecha.isoweekday():continue
        start=datetime.combine(query.fecha,begin,ZONE)
        bound=datetime.combine(query.fecha,end,ZONE)
        while start+timedelta(minutes=duration)<=bound:
            finish=start+timedelta(minutes=duration)
            if now+timedelta(minutes=cfg.anticipacion_minima_minutos)<=start<now+timedelta(days=min(cfg.anticipacion_maxima_dias,366)) and not any(overlaps(start,finish,a,b) for a,b in occupied):
                slots.append({'inicio_en':start,'fin_en':finish})
            start+=timedelta(minutes=cfg.intervalo_slots_minutos)
    return {'timezone':'America/Lima','fecha_local':query.fecha,'profesional_id':query.profesional_id,'servicios':list(query.servicios),
            'duracion_minutos':duration,'precio_total':total,'anticipo_requerido':required,'slots':slots,
            'disponibilidad_es_propuesta':True,'pendientes_vencidas_ocupan_hasta_expirar':True}
