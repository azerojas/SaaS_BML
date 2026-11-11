import calendar
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo
from .errors import ReportError

ZONE = ZoneInfo('America/Lima')


def next_month(value):
    return date(value.year + (value.month == 12), value.month % 12 + 1, 1)


@dataclass(frozen=True)
class ReportFilter:
    desde: date
    hasta: date
    granularidad: str = 'day'
    servicio_id: int | None = None
    profesional_id: int | None = None
    metodo: str | None = None
    categoria_id: int | None = None

    def __post_init__(self):
        if self.desde >= self.hasta or self.desde.year < 1900 or self.hasta.year >= 9999:
            raise ReportError('rango_invalido', 'Se requiere 1900 <= desde < hasta < 9999; hasta es exclusiva.')
        if self.granularidad not in ('day', 'week', 'month'):
            raise ReportError('granularidad_invalida', 'Usa day, week o month.')
        if (self.hasta-self.desde).days > (366 if self.granularidad == 'day' else 3660):
            raise ReportError('rango_excesivo', 'Maximo 366 dias para day; 3660 para week/month.')

    @property
    def start(self): return datetime.combine(self.desde, time.min, ZONE)

    @property
    def end(self): return datetime.combine(self.hasta, time.min, ZONE)

    @property
    def cohort_filtered(self): return self.servicio_id is not None or self.profesional_id is not None

    def metadata(self):
        return {'desde':self.desde.isoformat(), 'hasta':self.hasta.isoformat(), 'hasta_exclusiva':True,
                'timezone':'America/Lima','moneda':'PEN','granularidad':self.granularidad,
                'filtros':{key:getattr(self,key) for key in ('servicio_id','profesional_id','metodo','categoria_id') if getattr(self,key) is not None},
                'alcance_ventas':'COHORTE_VENTAS_COMPLETAS' if self.cohort_filtered else 'ESTABLECIMIENTO'}


def bucket(value, granularity):
    local = value.astimezone(ZONE).date() if isinstance(value, datetime) else value
    if granularity == 'week': return local - timedelta(days=local.weekday())
    if granularity == 'month': return local.replace(day=1)
    return local


def buckets(filters):
    current=bucket(filters.desde,filters.granularidad)
    while current < filters.hasta:
        following=next_month(current) if filters.granularidad=='month' else current+timedelta(days=7 if filters.granularidad=='week' else 1)
        yield current,max(current,filters.desde),min(following,filters.hasta)
        current=following


def preset_period(preset, anchor):
    if preset=='day': return anchor,anchor+timedelta(days=1)
    if preset=='week':
        start=anchor-timedelta(days=anchor.weekday())
        return start,start+timedelta(days=7)
    start=anchor.replace(day=1)
    return start,next_month(start)


def birthday_in_year(original, year):
    return date(year,original.month,min(original.day,calendar.monthrange(year,original.month)[1]))
