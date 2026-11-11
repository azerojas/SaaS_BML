"""Manual verifiable cash ledger. Call mutations only inside the shared finance executor."""
import hashlib
import json
from datetime import datetime,time,timedelta
from zoneinfo import ZoneInfo
from django.db.models import Max
from django.shortcuts import get_object_or_404
from django.utils import timezone
from negocio import models as m
from apps.finanzas.models import Refund,SaleAdjustment,CashReconciliation
from apps.finanzas.domain.money import ZERO,quantize
from apps.finanzas.domain.errors import FinanceError
from .audit import record
from . import selectors

ZONE=ZoneInfo('America/Lima')


def refund(data,actor,key):
    is_payment='pago_id' in data
    source=get_object_or_404((m.Pagos if is_payment else m.AnticiposCita).objects.select_for_update(),pk=data.get('pago_id',data.get('anticipo_id')))
    if source.estado!='CONFIRMADO':raise FinanceError('fuente_no_confirmada','Solo se devuelve un cobro confirmado.')
    lookup={'pago_id':source.pk} if is_payment else {'anticipo_id':source.pk}
    returned=selectors.sum_amount(Refund.objects.filter(**lookup))
    available=source.monto-returned
    if not is_payment:
        if source.venta_id is not None:raise FinanceError('anticipo_legacy_ambiguo','Conciliar el vinculo antiguo antes de devolver.')
        appointment=get_object_or_404(m.Citas.objects.select_for_update(),pk=source.cita_id)
        if appointment.estado not in ('CANCELADA','EXPIRADA','NO_ASISTIO'):
            raise FinanceError('cita_no_terminal','Cancelar o resolver la cita antes de devolver el anticipo no aplicado.')
        from apps.finanzas.models import AdvanceApplication
        available-=selectors.sum_amount(AdvanceApplication.objects.filter(anticipo_id=source.pk))
    if data['monto']>available:raise FinanceError('reembolso_excesivo','Supera el cobro disponible no devuelto/aplicado.')
    reference=data.get('referencia','')
    if data['metodo']!='EFECTIVO' and not reference:raise FinanceError('referencia_requerida','Se requiere referencia de devolucion.','invalid')
    if reference and Refund.objects.filter(metodo=data['metodo'],referencia=reference).exists():raise FinanceError('referencia_duplicada','La referencia de devolucion ya existe.')
    obj=Refund.objects.create(**lookup,monto=data['monto'],metodo=data['metodo'],referencia=reference,
        motivo=data['motivo'],clave_operacion=key,creado_por=actor)
    record(actor,obj,'REEMBOLSO_CONFIRMADO',{'monto':str(obj.monto),'fuente':lookup})
    return {'reembolso_id':obj.pk,'monto':obj.monto,'fuente_disponible':available-obj.monto,'afecta_stock':False}


def adjust(sale_id,data,actor,key):
    sale=get_object_or_404(m.Ventas.objects.select_for_update(),pk=sale_id)
    if sale.estado!='CONFIRMADA':raise FinanceError('venta_no_confirmada','Se ajusta una venta confirmada.')
    previous=selectors.sum_amount(SaleAdjustment.objects.filter(venta_id=sale.pk))
    if data['monto']>sale.total-sale.propina-previous or data['monto']>selectors.balance_summary(sale)['saldo_pendiente']:
        raise FinanceError('ajuste_excesivo','El ajuste supera saldo descubierto o total sin propina; devolver cobros primero.')
    obj=SaleAdjustment.objects.create(venta_id=sale.pk,monto=data['monto'],motivo=data['motivo'],clave_operacion=key,creado_por=actor)
    record(actor,obj,'AJUSTE_COMERCIAL',{'venta_id':sale.pk,'monto':str(obj.monto),'afecta_stock':False})
    return {'ajuste_id':obj.pk,**selectors.balance_summary(sale)}


def range_snapshots(first,last,methods):
    from collections import defaultdict
    start=datetime.combine(first,time.min,ZONE)
    end=datetime.combine(last,time.min,ZONE)
    groups=defaultdict(list)
    for kind,model,parent in [('pago',m.Pagos,'venta_id'),('anticipo',m.AnticiposCita,'cita_id')]:
        values=list(model.objects.filter(pagado_en__gte=start,pagado_en__lt=end,metodo__in=methods).order_by('id').values('id','monto','estado','pagado_en','referencia','metodo',parent)[:50001])
        if len(values)>50000:raise FinanceError('cierre_demasiado_grande','Maximo 50000 fuentes por rango.','invalid')
        for row in values:
            groups[(row['pagado_en'].astimezone(ZONE).date(),row['metodo'])].append([kind,row['id'],str(row['monto']),row['estado'],row['pagado_en'].isoformat(),row['referencia'],row[parent]])
    values=list(Refund.objects.filter(creada_en__gte=start,creada_en__lt=end,metodo__in=methods).order_by('id').values('id','monto','pago_id','anticipo_id','referencia','metodo','creada_en')[:50001])
    if len(values)>50000:raise FinanceError('cierre_demasiado_grande','Maximo 50000 reembolsos por rango.','invalid')
    for row in values:
        groups[(row['creada_en'].astimezone(ZONE).date(),row['metodo'])].append(['reembolso',row['id'],str(row['monto']),row['pago_id'],row['anticipo_id'],row['referencia']])
    result={}
    for key,rows in groups.items():result[key]=summarize(rows)
    return result


def summarize(rows):
    from decimal import Decimal
    income=sum((Decimal(row[2]) for row in rows if row[0]!='reembolso' and row[3]=='CONFIRMADO'),ZERO)
    refunds=sum((Decimal(row[2]) for row in rows if row[0]=='reembolso'),ZERO)
    return {'ingresos':quantize(income),'reembolsos':quantize(refunds),'neto':quantize(income-refunds),
        'fuentes_hash':hashlib.sha256(json.dumps(rows,separators=(',',':')).encode()).hexdigest(),'fuentes_count':len(rows)}


def daily_snapshot(day,method):
    return range_snapshots(day,day+timedelta(days=1),[method]).get((day,method),summarize([]))


def reconcile(data,actor,key):
    if data['fecha']>=timezone.localdate():raise FinanceError('dia_abierto','Conciliar solo dias anteriores al actual.','invalid')
    snapshot=daily_snapshot(data['fecha'],data['metodo'])
    from decimal import Decimal
    if any(abs(snapshot[field])>Decimal('99999999999999.99') for field in ('ingresos','reembolsos','neto')):
        raise FinanceError('cierre_importe_excesivo','El total excede el limite del cierre; requiere revision contable.','invalid')
    if snapshot['neto']!=data['observado']:raise FinanceError('cierre_no_cuadra','El importe observado no coincide; investigar sin ajustar registros automaticamente.')
    revision=(CashReconciliation.objects.filter(fecha=data['fecha'],metodo=data['metodo']).aggregate(value=Max('revision'))['value'] or 0)+1
    obj=CashReconciliation.objects.create(fecha=data['fecha'],metodo=data['metodo'],revision=revision,
        **{name:snapshot[name] for name in ('ingresos','reembolsos','neto','fuentes_hash')},observado=data['observado'],
        evidencia_sha256=data['evidencia_sha256'],referencia=data['referencia'],creado_por=actor,clave_operacion=key)
    record(actor,obj,'CONCILIAR_RECAUDACION',{'fecha':str(obj.fecha),'metodo':obj.metodo,'revision':revision})
    return {'conciliacion_id':obj.pk,'revision':revision,**snapshot,'conciliacion':'MANUAL_CON_EVIDENCIA'}


def reconciled_range(filters):
    if filters.cohort_filtered:return {'neto':None,'conciliada':False,'motivo':'CAJA_NO_ATRIBUIBLE_A_COHORTE'}
    from apps.finanzas.presentation.serializers import METHODS
    methods=[filters.metodo] if filters.metodo else METHODS
    closes=list(CashReconciliation.objects.filter(fecha__gte=filters.desde,fecha__lt=filters.hasta,metodo__in=methods).order_by('fecha','metodo','-revision').distinct('fecha','metodo'))
    latest={}
    for row in closes:latest.setdefault((row.fecha,row.metodo),row)
    if not latest:return {'neto':None,'conciliada':False,'motivo':'FALTAN_CONCILIACIONES_CON_EVIDENCIA'}
    # Each day/method requires a closure, including zero days; no silent gaps in a long range.
    net=ZERO
    income=refunds=ZERO
    try:snapshots=range_snapshots(filters.desde,filters.hasta,methods)
    except FinanceError as error:
        if error.code!='cierre_demasiado_grande':raise
        return {'neto':None,'conciliada':False,'motivo':'CONCILIACION_EXCEDE_LIMITE_DE_FUENTES'}
    day=filters.desde
    if (filters.hasta-day).days>366:return {'neto':None,'conciliada':False,'motivo':'CONCILIACION_MAXIMO_366_DIAS'}
    while day<filters.hasta:
        for method in methods:
            close=latest.get((day,method))
            if close is None:return {'neto':None,'conciliada':False,'motivo':'FALTAN_CONCILIACIONES_CON_EVIDENCIA'}
            current=snapshots.get((day,method),summarize([]))
            if close.fuentes_hash!=current['fuentes_hash'] or close.observado!=current['neto']:
                return {'neto':None,'conciliada':False,'motivo':'CONCILIACION_OBSOLETA_POR_CAMBIOS'}
            net+=close.neto
            income+=close.ingresos
            refunds+=close.reembolsos
        day+=timedelta(days=1)
    return {'neto':quantize(net),'ingresos':quantize(income),'reembolsos':quantize(refunds),'conciliada':True,'motivo':'CONCILIACION_MANUAL_CON_EVIDENCIA_NO_FISCAL'}
