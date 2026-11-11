from collections import defaultdict
from dataclasses import replace
from datetime import date, timedelta
from decimal import Decimal, localcontext
from django.db.models import Sum, Count
from django.db.models.functions import TruncDay, TruncWeek, TruncMonth
from django.utils import timezone
from apps.finanzas.domain.money import ZERO, quantize
from apps.reporting.domain.metrics import DEFINITIONS, sale_breakdown, percentage_change
from apps.reporting.domain.periods import ReportFilter, ZONE, bucket, buckets, next_month
from apps.reporting.infrastructure import repositories as repo
from apps.reporting.infrastructure.snapshot import read_snapshot

BASE_WARNINGS=['ESTADOS_ACTUALES_NO_RECONSTRUYEN_CIERRES_HISTORICOS',
               'UTILIDAD_OPERATIVA_ESTIMADA_NO_FISCAL']


def summed(qs, field='monto'):
    return qs.aggregate(value=Sum(field))['value'] or ZERO


def quality(warnings):
    return {'recaudacion_conciliada':False,'dinero_recaudado_habilitado':False,
            'advertencias':sorted(set(BASE_WARNINGS)|set(warnings))}


def envelope(filters, warnings=()):
    return {'periodo':filters.metadata(),'generado_en':timezone.now(), 'calidad':quality(warnings)}


def sale_metrics(filters):
    data=repo.ledger(filters)
    warnings=set()
    services=products=direct=fees=tips=total=balance=ZERO
    revenue_ok=costs_ok=balance_ok=True
    rows=[]
    apps=defaultdict(list)
    for app in data.applications: apps[app.venta_id].append(app)
    with localcontext() as ctx:
        ctx.prec=48
        for sale in data.sales:
            result=sale_breakdown(sale,data.lines[sale.pk],data.consumptions,data.movements,data.verified)
            rows.extend({**row,'venta_id':sale.pk,'clienta_id':sale.clienta_id} for row in result['rows'])
            warnings|=result['warnings']
            revenue_ok &= result['revenue_ok']
            costs_ok &= result['costs_ok']
            total+=sale.total
            tips+=sale.propina
            direct+=result['costo_exacto']
            fees+=result['comisiones']
            services+=sum((row['ingreso'] for row in result['rows'] if row['tipo']=='SERVICIO'),ZERO)
            products+=sum((row['ingreso'] for row in result['rows'] if row['tipo']=='PRODUCTO'),ZERO)
            covered=data.balances.get(sale.pk,ZERO)-data.refunded.get(sale.pk,ZERO)
            if data.legacy[sale.pk]:
                balance_ok=False
                warnings.add('ANTICIPO_LEGACY_SIN_ASIGNACION_VERIFICABLE')
            for app in apps[sale.pk]:
                advance=data.advances.get(app.anticipo_id)
                valid=advance is not None and advance.estado=='CONFIRMADO' and advance.pagado_en is not None and advance.venta_id is None and advance.total_aplicado<=advance.monto and advance.cita.visita_id==sale.visita_id and advance.cita.clienta_id==sale.clienta_id and advance.cita.estado not in repo.TERMINAL_CITAS
                if not valid:
                    balance_ok=False
                    warnings.add('APLICACION_ANTICIPO_NO_CONCILIA')
                covered+=app.monto
            adjusted_total=sale.total-data.adjustments.get(sale.pk,ZERO)
            if covered<ZERO or covered>adjusted_total:
                balance_ok=False
                warnings.add('COBERTURA_SUPERA_VENTA')
            balance+=adjusted_total-covered
    service_cost=sum((row['costo_exacto'] for row in rows if row['tipo']=='SERVICIO'),ZERO)
    product_cost=sum((row['costo_exacto'] for row in rows if row['tipo']=='PRODUCTO'),ZERO)
    return {'data':data,'rows':rows,'warnings':warnings,'revenue_ok':revenue_ok,'costs_ok':costs_ok,
            'ventas_confirmadas':quantize(total),'numero_ventas':len(data.sales),'propinas':quantize(tips),
            'ingreso_por_servicios':quantize(services) if revenue_ok else None,
            'ingreso_por_productos':quantize(products) if revenue_ok else None,
            'ingreso_operativo':quantize(services+products) if revenue_ok else None,
            'costo_directo':quantize(direct) if costs_ok else None,
            'costo_servicios':quantize(service_cost) if costs_ok else None,
            'costo_productos':quantize(product_cost) if costs_ok else None,
            'margen_servicios_antes_comisiones':quantize(services-service_cost) if revenue_ok and costs_ok else None,
            'margen_productos':quantize(products-product_cost) if revenue_ok and costs_ok else None,
            'comisiones':quantize(fees) if revenue_ok else None,
            'margen_contribucion':quantize(services+products-direct) if revenue_ok and costs_ok else None,
            'margen_tras_comisiones':quantize(services+products-direct-fees) if revenue_ok and costs_ok else None,
            'saldo_pendiente':quantize(balance) if balance_ok else None,
            'ticket_promedio':quantize(total/Decimal(len(data.sales))) if data.sales else Decimal('0.00')}


def overview(filters):
    result=sale_metrics(filters)
    expense=quantize(summed(repo.expense_rows(filters)))
    warnings=result['warnings']
    if filters.cohort_filtered: warnings.add('GASTOS_NO_ASIGNADOS_A_COHORTE')
    missing_sale_dates=repo.m.Ventas.objects.filter(estado='CONFIRMADA',confirmada_en__isnull=True).exists()
    missing_advance_dates=repo.m.AnticiposCita.objects.filter(estado='CONFIRMADO',pagado_en__isnull=True).exists()
    if missing_sale_dates or missing_advance_dates: warnings.add('FUENTES_CONFIRMADAS_SIN_FECHA_NO_ASIGNABLES')
    excluded_advances=repo.m.AnticiposCita.objects.filter(estado='CONFIRMADO',pagado_en__gte=filters.start,pagado_en__lt=filters.end,cita__estado__in=repo.TERMINAL_CITAS).exists()
    if excluded_advances: warnings.add('ANTICIPOS_CITA_TERMINAL_EXCLUIDOS_SIN_INFERIR_REEMBOLSO')
    metrics={key:value for key,value in result.items() if key not in ('data','rows','warnings','revenue_ok','costs_ok')}
    metrics.update({'cobros_registrados':quantize(summed(repo.cash_payments(filters))),
                    'anticipos_recibidos':quantize(summed(repo.cash_advances(filters))),
                    'dinero_recaudado':None,'gastos_operativos':expense,
                    'utilidad_estimada':quantize(result['margen_tras_comisiones']-expense) if result['margen_tras_comisiones'] is not None and not filters.cohort_filtered and not missing_sale_dates else None})
    from apps.finanzas.application.cash_ledger import reconciled_range
    cash=reconciled_range(filters)
    adjustments=quantize(sum(result['data'].adjustments.values(),ZERO))
    metrics['ajustes_comerciales']=adjustments
    metrics['ventas_netas_ajustes']=metrics['ventas_confirmadas']-adjustments
    if metrics['utilidad_estimada'] is not None:metrics['utilidad_estimada']-=adjustments
    metrics['dinero_recaudado']=cash['neto']
    metrics['entradas_conciliadas']=cash.get('ingresos')
    metrics['salidas_conciliadas']=cash.get('reembolsos')
    if not cash['conciliada']:warnings.add(cash['motivo'])
    visits=repo.visit_counts(filters)
    metrics.update({'visitas_finalizadas':visits['visitas'],'clientas_unicas_atendidas':visits['clientas'],
                    'stock_bajo':repo.inventory(filters).filter(bajo_minimo=True).count()})
    client_stats=repo.client_indicators(timezone.localdate(timezone=ZONE))
    metrics.update({key:client_stats[key] for key in ('cumpleanios_proximos','clientas_inactivas')})
    output=envelope(filters,warnings)
    output['calidad'].update({'recaudacion_conciliada':cash['conciliada'],'dinero_recaudado_habilitado':cash['conciliada'],
        'tipo_conciliacion':'MANUAL_CON_EVIDENCIA','estado_conciliacion':cash['motivo']})
    return {**output,'indicadores':metrics,'definiciones':DEFINITIONS,
            'alcance_saldo':'COHORTE_VENTAS_CONFIRMADAS_EN_RANGO_CON_COBERTURA_ACTUAL',
            'referencia_indicadores_clientas':client_stats['referencia'],
            'ventas_asignables_al_periodo':not missing_sale_dates,
            'utilidad_estimada_habilitada':metrics['utilidad_estimada'] is not None}


def revenue_series(filters):
    trunc={'day':TruncDay,'week':TruncWeek,'month':TruncMonth}[filters.granularidad]
    values={key:{'inicio_periodo':key.isoformat(),'desde':start.isoformat(),'hasta':end.isoformat(),
                 'etiqueta':key.isoformat(),'ventas_confirmadas':Decimal('0.00'),'cobros_registrados':Decimal('0.00'),'anticipos_recibidos':Decimal('0.00')}
            for key,start,end in buckets(filters)}
    for qs,field,value,key in [(repo.sale_scope(filters),'confirmada_en','total','ventas_confirmadas'),
        (repo.cash_payments(filters),'pagado_en','monto','cobros_registrados'),
        (repo.cash_advances(filters),'pagado_en','monto','anticipos_recibidos')]:
        for row in qs.annotate(period=trunc(field,tzinfo=ZONE)).values('period').annotate(amount=Sum(value)).order_by('period'):
            values[bucket(row['period'],filters.granularidad)][key]=quantize(row['amount'])
    return {**envelope(filters),'results':list(values.values()),'fuentes_fecha':{'ventas':'confirmada_en','pagos':'pagado_en','anticipos':'pagado_en'},'anticipo_aplicado_es_nuevo_cobro':False}


def payment_methods(filters):
    payments={row['metodo']:row for row in repo.cash_payments(filters).values('metodo').annotate(monto=Sum('monto'),cantidad=Count('id'))}
    advances={row['metodo']:row for row in repo.cash_advances(filters).values('metodo').annotate(monto=Sum('monto'),cantidad=Count('id'))}
    results=[]
    for method in sorted(set(payments)|set(advances)):
        p,a=payments.get(method,{}),advances.get(method,{})
        results.append({'metodo':method,'cobros_registrados':quantize(p.get('monto',ZERO)),'pagos_count':p.get('cantidad',0),
                        'anticipos_recibidos':quantize(a.get('monto',ZERO)),'anticipos_count':a.get('cantidad',0)})
    return {**envelope(filters),'results':results,'componentes_separados':True}


def top_services(filters, ordering='importe'):
    source=sale_metrics(filters)
    grouped={}
    for row in source['rows']:
        if row['tipo']!='SERVICIO': continue
        pk=row['servicio_id']
        group=grouped.setdefault(pk,{'servicio_id':pk,'descripcion_snapshot':row['descripcion'],'cantidad':ZERO,'ingreso':ZERO,'costo_directo':ZERO,'comisiones':ZERO,'ventas':set()})
        group['cantidad']+=row['cantidad']
        group['ingreso']+=row['ingreso']
        group['costo_directo']+=row['costo_exacto']
        group['comisiones']+=row['comision']
        group['ventas'].add(row['venta_id'])
    rows=list(grouped.values())
    rows.sort(key=lambda row:(-(row['ingreso'] if ordering=='importe' and source['revenue_ok'] else row['cantidad']),row['servicio_id']))
    for row in rows:
        row['numero_ventas']=len(row.pop('ventas'))
        row['ingreso']=quantize(row['ingreso']) if source['revenue_ok'] else None
        row['costo_directo']=quantize(row['costo_directo']) if source['costs_ok'] else None
        row['comisiones']=quantize(row['comisiones']) if source['revenue_ok'] else None
    return {**envelope(filters,source['warnings']),'results':rows,'orden_efectivo':ordering if source['revenue_ok'] else 'cantidad'}


def top_clients(filters, ordering='importe'):
    qs=repo.sale_scope(filters).exclude(clienta_id=None)
    rows=repo.bounded(qs.values('clienta_id','clienta__nombres','clienta__apellidos').annotate(ventas_confirmadas=Sum('total'),numero_ventas=Count('id')).order_by('clienta_id'),repo.MAX_SALES)
    visits=repo.m.Visitas.objects.filter(estado='FINALIZADA',fin_en__gte=filters.start,fin_en__lt=filters.end,clienta_id__in=[row['clienta_id'] for row in rows]).exclude(citas__estado__in=repo.TERMINAL_CITAS)
    if filters.cohort_filtered: visits=visits.filter(ventas__in=repo.sale_scope(filters,dated=False))
    counts={row['clienta_id']:row['cantidad'] for row in visits.values('clienta_id').annotate(cantidad=Count('id',distinct=True))}
    result=[{'clienta_id':row['clienta_id'],'nombre':row['clienta__nombres']+' '+row['clienta__apellidos'],
             'ventas_confirmadas':quantize(row['ventas_confirmadas']),'numero_ventas':row['numero_ventas'],'visitas_finalizadas':counts.get(row['clienta_id'],0)} for row in rows]
    result.sort(key=lambda row:(-(row['ventas_confirmadas'] if ordering=='importe' else row['visitas_finalizadas']),row['clienta_id']))
    return {**envelope(filters),'results':result,'incluye':'CLIENTAS_CON_VENTA_CONFIRMADA_EN_RANGO','sin_clienta_ventas':qs.model.objects.filter(pk__in=repo.sale_scope(filters).filter(clienta_id=None).values('pk')).count()}


def inventory_alerts(filters):
    qs=repo.inventory(filters)
    stats=qs.aggregate(articulos_activos=Count('articulo_id'),stock_bajo=Count('articulo_id',filter=repo.Q(bajo_minimo=True)),sin_existencia=Count('articulo_id',filter=repo.Q(existencia__lte=0)),stock_negativo=Count('articulo_id',filter=repo.Q(existencia__lt=0)))
    rows=list(qs.filter(bajo_minimo=True).values('articulo_id','nombre','tipo','unidad','stock_minimo','existencia','bajo_minimo')[:5001])
    if len(rows)>5000:
        from apps.reporting.domain.errors import ReportError
        raise ReportError('reporte_demasiado_grande','Filtra una categoria para consultar inventario.','limit')
    warnings=['INVENTARIO_ACTUAL_NO_HISTORICO','SIN_TRAZABILIDAD_EXISTENCIA_POR_LOTE']
    if stats['stock_negativo']:warnings.append('STOCK_NEGATIVO_REQUIERE_CONCILIACION')
    return {**envelope(filters,warnings),
            'estadisticas':stats,'results':rows,'foto_actual':True,'valoracion_total':None}


def expenses(filters):
    rows=repo.bounded(repo.expense_rows(filters).values('categoria_id','categoria__nombre').annotate(monto=Sum('monto'),cantidad=Count('id')).order_by('-monto','categoria_id'),5000)
    return {**envelope(filters),'total':quantize(sum((row['monto'] for row in rows),ZERO)),
            'results':[{'categoria_id':row['categoria_id'],'categoria':row['categoria__nombre'],'monto':quantize(row['monto']),'cantidad':row['cantidad']} for row in rows]}


def month_comparison(month, today):
    start=date.fromisoformat(month+'-01')
    previous=(start-timedelta(days=1)).replace(day=1)
    current_end=next_month(start)
    previous_end=start
    partial=start.year==today.year and start.month==today.month
    if partial:
        current_end=today+timedelta(days=1)
        previous_end=min(start,previous+timedelta(days=today.day))
    current=overview(ReportFilter(start,current_end))
    before=overview(ReportFilter(previous,previous_end))
    differences={}
    for key in ('ventas_confirmadas','cobros_registrados','anticipos_recibidos','utilidad_estimada','numero_ventas'):
        a,b=current['indicadores'][key],before['indicadores'][key]
        differences[key]={'diferencia':a-b if a is not None and b is not None else None,
                          'variacion_porcentaje':percentage_change(Decimal(a),Decimal(b)) if a is not None and b is not None else None}
    return {'month':month,'timezone':'America/Lima','moneda':'PEN','parcial_mismo_dia':partial,
            'incluye_dia_actual':partial,'actual':current,'anterior':before,'comparacion':differences}


def clients_retention(filters, today):
    return {**envelope(filters),'indicadores':repo.client_indicators(today),'alcance':'FOTO_ACTUAL_NO_DEL_PERIODO'}


REPORTS={'overview':overview,'revenue-series':revenue_series,'payment-methods':payment_methods,
         'top-services':top_services,'top-clients':top_clients,'inventory-alerts':inventory_alerts,'expenses':expenses}


def execute(report, filters, **kwargs):
    with read_snapshot():
        with localcontext() as ctx:
            ctx.prec=48
            return REPORTS[report](filters,**kwargs)


def export_data(report, filters, ordering='importe'):
    # Same snapshot and services as the dashboard; no second set of formulas.
    with read_snapshot():
        with localcontext() as ctx:
            ctx.prec=48
            if report=='overview':
                details=overview(filters)
                return details,details
            # Client/inventory permissions do not grant access to general profit indicators.
            summary=overview(filters) if report in ('revenue-series','payment-methods','top-services') else envelope(filters)
            details=REPORTS[report](filters,**({'ordering':ordering} if report in ('top-services','top-clients') else {}))
            return summary,details
