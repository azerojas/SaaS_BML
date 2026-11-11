from datetime import datetime,timedelta
import re
from django.db.models import Q
from django.utils.dateparse import parse_date
from django.shortcuts import get_object_or_404
from apps.agenda.domain.errors import AgendaError
from apps.agenda.domain.rules import ZONE
from apps.agenda.infrastructure import repositories as repo
from negocio import models as m


def integer(params,name):
    if name not in params:return None
    try:
        value=int(params[name])
        if value<=0:raise ValueError
        return value
    except (ValueError,TypeError):raise AgendaError('INVALID_FILTER','ID positivo requerido.','invalid') from None


def filter_dates(qs,params,field):
    if ('desde' in params)!=('hasta' in params):raise AgendaError('INVALID_RANGE','Indica desde y hasta exclusiva.','invalid')
    if 'desde' not in params:return qs
    try:
        if any(not re.fullmatch(r'\d{4}-\d{2}-\d{2}',params[key]) for key in ('desde','hasta')):raise ValueError
        start,end=parse_date(params['desde']),parse_date(params['hasta'])
        if start is None or end is None or start>=end or (end-start).days>93:raise ValueError
    except (ValueError,TypeError):raise AgendaError('INVALID_RANGE','Rango YYYY-MM-DD semiabierto, maximo93 dias.','invalid') from None
    if field=='fecha_deseada':return qs.filter(fecha_deseada__gte=start,fecha_deseada__lt=end)
    return qs.filter(fin_en__gt=datetime.combine(start,datetime.min.time(),ZONE),inicio_en__lt=datetime.combine(end,datetime.min.time(),ZONE))


def list_rows(kind,params):
    source={
        'profesionales':lambda:m.Profesionales.objects.all().order_by('apellidos','nombres','id'),
        'horarios':lambda:m.HorariosProfesional.objects.all().order_by('profesional_id','dia_semana','hora_inicio','id'),
        'bloqueos':lambda:m.BloqueosAgenda.objects.all().order_by('inicio_en','id'),
        'citas':lambda:repo.appointments().order_by('inicio_en','id'),
        'lista-espera':lambda:m.ListaEspera.objects.select_related('servicio').order_by('fecha_deseada','id'),
    }
    qs=source[kind]()
    permitted={'page','page_size'}
    if kind=='profesionales':permitted|={'activa','servicio_id'}
    else:permitted|={'profesional_id'}
    if kind in ('citas','lista-espera'):permitted|={'clienta_id','estado','desde','hasta'}
    if kind=='bloqueos':permitted|={'desde','hasta'}
    if set(params)-permitted:raise AgendaError('INVALID_FILTER','Filtro desconocido o no admitido.','invalid')
    for key in ('profesional_id','clienta_id'):
        if key in permitted and key in params:qs=qs.filter(**{key:integer(params,key)})
    if kind=='profesionales':
        if 'activa' in params:
            if params['activa'] not in ('true','false'):raise AgendaError('INVALID_FILTER','activa requiere true/false.','invalid')
            qs=qs.filter(activa=params['activa']=='true')
        if 'servicio_id' in params:qs=qs.filter(profesionalservicios__servicio_id=integer(params,'servicio_id'))
    if 'estado' in params:
        allowed=['ACTIVA','NOTIFICADA','CONVERTIDA','CANCELADA'] if kind=='lista-espera' else ['PENDIENTE_PAGO','PROGRAMADA','CONFIRMADA','COMPLETADA','CANCELADA','NO_ASISTIO','EXPIRADA']
        if params['estado'] not in allowed:raise AgendaError('INVALID_FILTER','Estado de filtro invalido.','invalid')
        qs=qs.filter(estado=params['estado'])
    return filter_dates(qs,params,{'citas':'inicio_en','bloqueos':'inicio_en','lista-espera':'fecha_deseada'}.get(kind,'inicio_en')) if kind!='profesionales' and kind!='horarios' else qs


def detail(pk):
    obj=get_object_or_404(repo.appointments(),pk=pk)
    from .common import deposited
    return obj,{'historial':list(m.CitaEstadosHistorial.objects.filter(cita_id=pk).order_by('id').values('id','estado_anterior','estado_nuevo','cambiado_por_id','origen','detalle','cambiado_en')),
                'anticipo_confirmado':deposited(pk),'anticipo_pendiente':max(obj.anticipo_requerido-deposited(pk),0)}
