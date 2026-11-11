from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from django.db.models import Exists, OuterRef, Q, Sum, Count, F, CharField,Subquery
from django.db.models.functions import Cast, ExtractMonth, ExtractDay
from apps.finanzas.models import AdvanceApplication,Refund,SaleAdjustment
from apps.reporting.domain.errors import ReportError
from apps.reporting.domain.periods import birthday_in_year, ZONE
from negocio import models as m

MAX_SALES=5000
MAX_ROWS=50000
TERMINAL_CITAS=['CANCELADA','EXPIRADA','NO_ASISTIO']


def bounded(queryset, limit=MAX_ROWS):
    result=list(queryset[:limit+1])
    if len(result)>limit:
        raise ReportError('reporte_demasiado_grande','Reduce el rango o filtros; no se devuelven totales parciales.','limit')
    return result


def sale_scope(filters, dated=True):
    qs=m.Ventas.objects.filter(estado='CONFIRMADA')
    if dated: qs=qs.filter(confirmada_en__gte=filters.start,confirmada_en__lt=filters.end)
    if filters.cohort_filtered:
        lines=m.DetallesVenta.objects.filter(venta_id=OuterRef('pk'))
        if filters.servicio_id: lines=lines.filter(servicio_id=filters.servicio_id)
        if filters.profesional_id: lines=lines.filter(profesional_id=filters.profesional_id)
        qs=qs.filter(Exists(lines))
    return qs


@dataclass
class LedgerData:
    sales:list
    lines:dict
    consumptions:dict
    movements:dict
    verified:set
    balances:dict
    applications:list
    advances:dict
    legacy:dict
    refunded:dict
    adjustments:dict


def ledger(filters):
    sales=bounded(sale_scope(filters).select_related('visita').order_by('id'),MAX_SALES)
    ids=[sale.pk for sale in sales]
    lines=defaultdict(list)
    for line in bounded(m.DetallesVenta.objects.filter(venta_id__in=ids).order_by('venta_id','id')):
        lines[line.venta_id].append(line)
    consumptions=defaultdict(list)
    for consumption in bounded(m.ConsumosServicio.objects.filter(detalle_venta__venta_id__in=ids).order_by('id')):
        consumptions[consumption.detalle_venta_id].append(consumption)
    moves={}
    for move in bounded(m.MovimientosInventario.objects.filter(Q(detalle_venta__venta_id__in=ids)|Q(consumo_servicio__detalle_venta__venta_id__in=ids)).order_by('id')):
        if move.detalle_venta_id: moves['producto',move.detalle_venta_id]=move
        if move.consumo_servicio_id: moves['consumo',move.consumo_servicio_id]=move
    verified=set(m.Auditoria.objects.filter(entidad='ventas',entidad_id__in=[str(pk) for pk in ids],accion='CONFIRMAR_VENTA',datos__politica_costo='PROMEDIO_PONDERADO_COMPRAS_RECIBIDAS_HISTORICAS_V1').values_list('entidad_id',flat=True))
    applications=bounded(AdvanceApplication.objects.filter(venta_id__in=ids).order_by('id'))
    advance_ids={row.anticipo_id for row in applications}
    advances={row.pk:row for row in bounded(m.AnticiposCita.objects.filter(pk__in=advance_ids).select_related('cita').order_by('id'))}
    # Validate total allocation across ALL sales, not merely those selected by the report.
    totals={row['anticipo_id']:row['amount'] for row in AdvanceApplication.objects.filter(anticipo_id__in=advance_ids).values('anticipo_id').annotate(amount=Sum('monto'))}
    for advance in advances.values(): advance.total_aplicado=totals.get(advance.pk,0)
    balances={row['venta_id']:row['amount'] for row in m.Pagos.objects.filter(venta_id__in=ids,estado='CONFIRMADO').values('venta_id').annotate(amount=Sum('monto'))}
    legacy=defaultdict(list)
    for row in bounded(m.AnticiposCita.objects.filter(venta_id__in=ids,estado='CONFIRMADO').select_related('cita').order_by('id')):
        legacy[row.venta_id].append(row)
    refunded={row['sale']:row['amount'] for row in Refund.objects.filter(pago_id__in=m.Pagos.objects.filter(venta_id__in=ids).values('id')).annotate(sale=Subquery(m.Pagos.objects.filter(pk=OuterRef('pago_id')).values('venta_id')[:1])).values('sale').annotate(amount=Sum('monto'))}
    adjustments={row['venta_id']:row['amount'] for row in SaleAdjustment.objects.filter(venta_id__in=ids).values('venta_id').annotate(amount=Sum('monto'))}
    return LedgerData(sales,lines,consumptions,moves,{int(pk) for pk in verified},balances,applications,advances,legacy,refunded,adjustments)


def cash_payments(filters):
    qs=m.Pagos.objects.filter(estado='CONFIRMADO',venta__estado='CONFIRMADA',pagado_en__gte=filters.start,pagado_en__lt=filters.end)
    if filters.cohort_filtered: qs=qs.filter(venta_id__in=sale_scope(filters,dated=False).values('id'))
    if filters.metodo: qs=qs.filter(metodo=filters.metodo)
    return qs


def cash_advances(filters):
    qs=m.AnticiposCita.objects.filter(estado='CONFIRMADO',pagado_en__gte=filters.start,pagado_en__lt=filters.end).exclude(cita__estado__in=TERMINAL_CITAS)
    if filters.metodo: qs=qs.filter(metodo=filters.metodo)
    if filters.cohort_filtered:
        qs=qs.filter(cita__visita__ventas__in=sale_scope(filters,dated=False))
    return qs


def expense_rows(filters):
    qs=m.GastosOperativos.objects.filter(fecha__gte=filters.desde,fecha__lt=filters.hasta)
    if filters.categoria_id: qs=qs.filter(categoria_id=filters.categoria_id)
    return qs


def visit_counts(filters):
    qs=m.Visitas.objects.filter(estado='FINALIZADA',fin_en__gte=filters.start,fin_en__lt=filters.end).exclude(citas__estado__in=TERMINAL_CITAS)
    if filters.cohort_filtered: qs=qs.filter(ventas__in=sale_scope(filters,dated=False))
    return qs.aggregate(visitas=Count('id',distinct=True),clientas=Count('clienta_id',distinct=True))


def inventory(filters):
    active=m.Articulos.objects.filter(activo=True)
    if filters.categoria_id: active=active.filter(categoria_id=filters.categoria_id)
    return m.VwStockActual.objects.filter(articulo_id__in=active.values('id')).order_by('articulo_id')


def client_indicators(today):
    provisional=m.Auditoria.objects.filter(entidad='clientas',entidad_id=Cast(OuterRef('pk'),CharField()),accion='ALTA_QR_PROVISIONAL')
    validated=m.Auditoria.objects.filter(entidad='clientas',entidad_id=Cast(OuterRef('pk'),CharField()),accion='VALIDAR_ALTA_QR')
    active=m.Clientas.objects.filter(activa=True).exclude(Exists(provisional)&~Exists(validated))
    dates=[today+timedelta(days=offset) for offset in range(30)]
    # Small bounded month/day predicate; no full-table Python scan of personal data.
    condition=Q()
    for day in dates: condition|=Q(fecha_nacimiento__month=day.month,fecha_nacimiento__day=day.day)
    if any(day.month==2 and day.day==28 and birthday_in_year(day.replace(year=2000,day=29),day.year).day==28 for day in dates):
        condition|=Q(fecha_nacimiento__month=2,fecha_nacimiento__day=29)
    birthdays=active.filter(condition).count()
    recent=m.Visitas.objects.filter(clienta_id=OuterRef('pk'),estado='FINALIZADA',fin_en__gte=datetime.combine(today-timedelta(days=90),time.min,ZONE),fin_en__lt=datetime.combine(today+timedelta(days=1),time.min,ZONE)).exclude(citas__estado__in=TERMINAL_CITAS)
    inactive=active.filter(~Exists(recent)).count()
    return {'cumpleanios_proximos':birthdays,'clientas_inactivas':inactive,'referencia':today.isoformat(),'ventana_cumpleanios_dias':30,'inactividad_dias':90}
