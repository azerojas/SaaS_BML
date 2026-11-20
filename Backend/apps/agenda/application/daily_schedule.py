"""A dated override replaces weekly working hours for exactly one professional/day."""
from datetime import datetime, timedelta, time
from django.db import connection
from django.db.models import Q
from django.db.migrations.recorder import MigrationRecorder
from django.shortcuts import get_object_or_404
from django.utils import timezone
from apps.agenda.models import DailySchedule
from apps.agenda.domain.errors import AgendaError
from apps.agenda.domain.rules import ACTIVE, ZONE, published_window, hourly_intervals
from apps.agenda.infrastructure import repositories as repo
from apps.finanzas.application.audit import record
from negocio import models as m


def installed():
    return MigrationRecorder(connection).migration_qs.filter(app='agenda',name='0003_daily_schedule').exists()


def ensure_ready():
    if not installed():
        raise AgendaError('DAILY_SCHEDULE_NOT_READY','Falta activar la configuración de horarios por fecha.','unavailable')


def shared_installed():
    return MigrationRecorder(connection).migration_qs.filter(app='agenda',name='0004_shared_schedule').exists()


def ensure_shared_ready():
    if not shared_installed():
        raise AgendaError('DAILY_SCHEDULE_NOT_READY','Falta activar la agenda general.','unavailable')


def dated_hours(professional_id, day, include_slot_mode=False, personal_only=False):
    activated = set(MigrationRecorder(connection).migration_qs.filter(app='agenda', name__in=['0003_daily_schedule', '0004_shared_schedule']).values_list('name', flat=True))
    if '0003_daily_schedule' not in activated:
        return None
    scope = Q(profesional_id=professional_id)
    if '0004_shared_schedule' in activated and not personal_only:
        scope |= Q(profesional_id__isnull=True)
    # PostgreSQL orders NULL last, preserving a professional's dated override
    # (including an explicitly closed day) before the shared salon schedule.
    row = DailySchedule.objects.filter(scope, fecha=day).order_by('profesional_id').first()
    if row is None:
        return None
    return [(day.isoweekday(),time.fromisoformat(item['inicio']),time.fromisoformat(item['fin'])) + ((bool(item.get('cupo_unico')), ) if include_slot_mode else ()) for item in row.franjas]


def output(row):
    row.franjas=[{**item,'inicio':item['inicio'].strftime('%H:%M'),'fin':item['fin'].strftime('%H:%M')}
        for item in hourly_intervals([{**item,'inicio':time.fromisoformat(item['inicio']),'fin':time.fromisoformat(item['fin'])} for item in row.franjas])]
    return {'id':row.pk,'profesional_id':row.profesional_id,'fecha':row.fecha.isoformat(),
        'franjas':row.franjas,'cerrado':not row.franjas,'origen':'FECHA'}


def outputs(rows):
    rows=list(rows)
    personal=set(repo.personal_slot_professionals().filter(pk__in=[row.profesional_id for row in rows]).values_list('pk',flat=True))
    for row in rows:
        if row.profesional_id in personal:
            row.franjas=[{**item,'cupo_unico':True} for item in row.franjas]
    result=[output(row) for row in rows]
    single=[row for row in rows if row.profesional_id is not None and any(item.get('cupo_unico') for item in row.franjas)]
    if not single:
        return result
    identifiers={row.profesional_id for row in single}
    lower=datetime.combine(min(row.fecha for row in single),time.min,ZONE)
    upper=datetime.combine(max(row.fecha for row in single)+timedelta(days=1),time.min,ZONE)
    occupied=list(m.Citas.objects.filter(profesional_id__in=identifiers,estado__in=ACTIVE,inicio_en__lt=upper,fin_en__gt=lower).values_list('profesional_id','inicio_en','fin_en')[:10001])
    from .public_booking import installed as public_installed, holds
    pending=[]
    if public_installed():
        pending=list(holds().filter(profesional_id__in=identifiers,inicio_en__lt=upper,fin_en__gt=lower).values('id','profesional_id','inicio_en','fin_en','nombres','apellidos','expira_en')[:10001])
        occupied+=[(item['profesional_id'],item['inicio_en'],item['fin_en']) for item in pending]
    if len(occupied)>10000:
        raise AgendaError('CALENDAR_TOO_LARGE','Reduce el rango de fechas para consultar los cupos.','invalid')
    for row,entry in zip(rows,result):
        entry['franjas']=[dict(item) for item in row.franjas]
        for item in entry['franjas']:
            if not item.get('cupo_unico') or row.profesional_id is None:
                continue
            start=datetime.combine(row.fecha,time.fromisoformat(item['inicio']),ZONE)
            end=datetime.combine(row.fecha,time.fromisoformat(item['fin']),ZONE)
            item['ocupado']=any(identifier==row.profesional_id and a<end and b>start for identifier,a,b in occupied)
            held=next((entry for entry in pending if entry['profesional_id']==row.profesional_id and entry['inicio_en']<end and entry['fin_en']>start),None)
            if held:
                item['solicitud_pendiente']={'id':str(held['id']),'clienta_nombre':held['nombres']+' '+held['apellidos'],'expira_en':held['expira_en'].isoformat()}
    return result


def ensure_coverage(professional_id, day, hours):
    lower = datetime.combine(day,time.min,ZONE)
    upper = lower + timedelta(days=1)
    appointments = m.Citas.objects.filter(estado__in=ACTIVE,inicio_en__lt=upper,fin_en__gt=lower)
    own_days = DailySchedule.objects.filter(fecha=day,profesional_id__isnull=False).values('profesional_id')
    appointments = appointments.filter(profesional_id=professional_id) if professional_id is not None else appointments.exclude(profesional_id__in=own_days)
    rows = list(appointments.values_list('inicio_en','fin_en')[:10001])
    from .public_booking import installed as public_installed, holds
    if public_installed():
        pending = holds().filter(inicio_en__lt=upper,fin_en__gt=lower)
        pending = pending.filter(profesional_id=professional_id) if professional_id is not None else pending.exclude(profesional_id__in=own_days)
        rows += list(pending.values_list('inicio_en','fin_en')[:10001])
    if len(rows)>10000:
        raise AgendaError('CALENDAR_TOO_LARGE','Reduce el número de reservas antes de modificar la jornada.','invalid')
    if any(published_window(start,end,hours,1,aligned=False) is None for start,end in rows):
        raise AgendaError('DAY_HAS_BOOKINGS','El horario dejaría citas o solicitudes pendientes fuera de la jornada. Reprográmalas primero.')


def save(data, actor, restore=False):
    ensure_ready()
    day = data['fecha']
    now = timezone.now().astimezone(ZONE).date()
    if not now <= day <= now+timedelta(days=366):
        raise AgendaError('INVALID_SCHEDULE_DATE','Configura una fecha entre hoy y los próximos 366 días.','invalid')
    professional_id = data.get('profesional_id')
    if professional_id is None:
        ensure_shared_ready()
    else:
        get_object_or_404(m.Profesionales.objects.select_for_update(),pk=professional_id,activa=True)
    previous = DailySchedule.objects.select_for_update().filter(profesional_id=professional_id,fecha=day).first()
    if restore:
        if previous:
            record(actor,previous,'RESTABLECER_JORNADA',{'fecha':day.isoformat(),'profesional_id':professional_id})
            previous.delete()
        ids = [professional_id] if professional_id is not None else list(m.Profesionales.objects.values_list('pk',flat=True)[:10001])
        if len(ids)>10000:
            raise AgendaError('CALENDAR_TOO_LARGE','Resuelve la jornada con un rango acotado.','invalid')
        for identifier in ids:
            ensure_coverage(identifier,day,repo.hours(identifier,day))
        return {'fecha':day.isoformat(),'profesional_id':professional_id,'restablecido':True}
    intervals = hourly_intervals(data['franjas'],strict=True)
    hours = [(day.isoweekday(),row['inicio'],row['fin'],row.get('cupo_unico',False)) for row in intervals]
    ensure_coverage(professional_id,day,hours)
    stored = [{'inicio':row['inicio'].strftime('%H:%M'),'fin':row['fin'].strftime('%H:%M'), **({'cupo_unico':True} if row.get('cupo_unico') else {})} for row in intervals]
    row,_ = DailySchedule.objects.update_or_create(profesional_id=professional_id,fecha=day,
        defaults={'franjas':stored,'actualizado_por_id':actor.pk})
    record(actor,row,'GUARDAR_JORNADA',{'fecha':day.isoformat(),'profesional_id':professional_id,'franjas':stored})
    return output(row)
