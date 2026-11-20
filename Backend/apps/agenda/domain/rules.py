from datetime import datetime,timedelta
from decimal import Decimal,localcontext
from zoneinfo import ZoneInfo
from apps.finanzas.domain.money import money,quantize
from .errors import AgendaError
from django.conf import settings

ZONE=ZoneInfo('America/Lima')
ACTIVE=('PENDIENTE_PAGO','PROGRAMADA','CONFIRMADA')
TRANSITIONS={
    'PENDIENTE_PAGO':{'PROGRAMADA','CANCELADA','EXPIRADA'},
    'PROGRAMADA':{'CONFIRMADA','CANCELADA','NO_ASISTIO','COMPLETADA','PENDIENTE_PAGO'},
    'CONFIRMADA':{'CANCELADA','NO_ASISTIO','COMPLETADA','PENDIENTE_PAGO'},
}


def transition(previous,target):
    if target not in TRANSITIONS.get(previous,set()):
        raise AgendaError('TRANSITION_NOT_ALLOWED','La transicion no esta permitida.')


def overlaps(a,b,c,d):return a<d and c<b


def booking_duration(service_minutes):
    """A fixed booking slot is independent of treatment duration and price."""
    return settings.AGENDA_BOOKING_SLOT_MINUTES or service_minutes


def hourly_windows(hours):
    minutes=settings.AGENDA_BOOKING_SLOT_MINUTES
    if not minutes:
        return list(hours)
    result=[]
    for day,begin,finish,*_ in hours:
        start=datetime.combine(datetime(2000,1,3).date(),begin)
        bound=datetime.combine(start.date(),finish)
        while start+timedelta(minutes=minutes)<=bound:
            end=start+timedelta(minutes=minutes)
            result.append((day,start.time(),end.time(),True))
            start=end
    return result


def hourly_intervals(intervals,strict=False):
    if not settings.AGENDA_BOOKING_SLOT_MINUTES:
        return intervals
    if strict and any((datetime.combine(datetime.min.date(),row['fin'])-datetime.combine(datetime.min.date(),row['inicio'])).total_seconds() % 3600 for row in intervals):
        raise AgendaError('INVALID_SLOT_DURATION','Publica cupos completos de una hora.','invalid')
    return [{'inicio':begin,'fin':end,'cupo_unico':True}
            for _,begin,end,_ in hourly_windows([(1,row['inicio'],row['fin']) for row in intervals])]


def fits(start,end,hours,step,aligned=True):
    local_start,local_end=start.astimezone(ZONE),end.astimezone(ZONE)
    if local_start.date()!=local_end.date():return False
    for day,begin,finish in hours:
        if local_start.isoweekday()!=day:continue
        lower=datetime.combine(local_start.date(),begin,ZONE)
        upper=datetime.combine(local_start.date(),finish,ZONE)
        if lower<=local_start<local_end<=upper and (not aligned or (local_start-lower).total_seconds() % (step*60)==0):
            return True
    return False


def horizon(start,cfg,now):
    if start<now+timedelta(minutes=cfg.anticipacion_minima_minutos) or start>=now+timedelta(days=min(cfg.anticipacion_maxima_dias,366)):
        raise AgendaError('BOOKING_OUTSIDE_WINDOW','Inicio fuera de la anticipacion minima/maxima configurada.','invalid')


def published_window(start,end,hours,step,aligned=True):
    """A fixed cupo starts exactly once and reserves the whole published window."""
    for row in hours:
        day,begin,finish=row[:3]
        single=len(row)>3 and row[3]
        if fits(start,end,[(day,begin,finish)],step,aligned=aligned):
            if single:
                lower=datetime.combine(start.astimezone(ZONE).date(),begin,ZONE)
                upper=datetime.combine(start.astimezone(ZONE).date(),finish,ZONE)
                if start!=lower:
                    continue
                return lower,upper
            return start,end
    return None


def amounts(services,cfg):
    with localcontext() as context:
        context.prec=48
        total=money(sum((row.precio_base for row in services),Decimal('0')))
        duration=sum(row.duracion_minutos or 0 for row in services)
        if any(not row.duracion_minutos or row.duracion_minutos<=0 for row in services) or not 0<duration<=720:
            raise AgendaError('INVALID_DURATION','Servicios requieren duracion positiva; maximo total720 minutos.','invalid')
        requires_deposit=settings.AGENDA_REQUIRE_DEPOSITS and any(row.requiere_anticipo for row in services)
        required=quantize(total*cfg.anticipo_porcentaje/Decimal('100')) if requires_deposit else Decimal('0.00')
        if requires_deposit and total>0 and required==0:
            raise AgendaError('DEPOSIT_POLICY_UNSET','Un servicio exige anticipo pero el porcentaje/monto configurado resulta cero.')
        return total,booking_duration(duration),required
