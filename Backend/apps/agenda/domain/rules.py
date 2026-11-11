from datetime import datetime,timedelta
from decimal import Decimal,localcontext
from zoneinfo import ZoneInfo
from apps.finanzas.domain.money import money,quantize
from .errors import AgendaError

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


def amounts(services,cfg):
    with localcontext() as context:
        context.prec=48
        total=money(sum((row.precio_base for row in services),Decimal('0')))
        duration=sum(row.duracion_minutos or 0 for row in services)
        if any(not row.duracion_minutos or row.duracion_minutos<=0 for row in services) or not 0<duration<=720:
            raise AgendaError('INVALID_DURATION','Servicios requieren duracion positiva; maximo total720 minutos.','invalid')
        required=quantize(total*cfg.anticipo_porcentaje/Decimal('100')) if any(row.requiere_anticipo for row in services) else Decimal('0.00')
        if any(row.requiere_anticipo for row in services) and total>0 and required==0:
            raise AgendaError('DEPOSIT_POLICY_UNSET','Un servicio exige anticipo pero el porcentaje/monto configurado resulta cero.')
        return total,duration,required
