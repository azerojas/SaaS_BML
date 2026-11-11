"""Report formulas reuse the exact Phase-5 cent allocation and commission rules."""
from decimal import Decimal, localcontext
from apps.finanzas.domain.money import ZERO, quantize, sale_totals, commission
from apps.finanzas.domain.errors import FinanceError


DEFINITIONS = {
    'ventas_confirmadas':'SUM ventas.total CONFIRMADA por confirmada_en; incluye propina.',
    'ingreso_por_servicios':'Netos SERVICIO menos descuento global asignado por mayores restos; sin propina.',
    'ingreso_por_productos':'Netos PRODUCTO menos descuento global asignado por mayores restos; sin propina.',
    'cobros_registrados':'SUM pagos CONFIRMADO de venta CONFIRMADA por pagado_en; excluye anticipos.',
    'anticipos_recibidos':'SUM anticipos CONFIRMADO de citas no canceladas/expiradas/no asistidas por pagado_en.',
    'dinero_recaudado':'Pagos + anticipos (incluidas citas terminales) - reembolsos, por fecha del evento. Solo si cada dia/medio tiene cierre manual con evidencia vigente; no sumar aplicaciones ni inferir conciliacion bancaria automatica.',
    'saldo_pendiente':'Ventas confirmadas del periodo menos pagos/aplicaciones hasta el instante de consulta; no saldo historico al cierre.',
    'costo_directo':'Productos y consumos reales por snapshots, con fuentes de inventario verificadas; no compras nuevamente.',
    'margen_contribucion':'Ingreso operativo sin propina menos costo directo; antes de comisiones y gastos.',
    'comisiones':'SUM por linea SERVICIO de neto tras descuento global x porcentaje_snapshot, HALF_UP 2.',
    'gastos_operativos':'SUM gastos_operativos.monto por fecha local, sin compras ni pagos de compras inferidos.',
    'utilidad_estimada':'Ingreso sin propina - costo directo - comisiones - gastos; estimacion operativa, no utilidad neta fiscal.',
    'ticket_promedio':'Ventas confirmadas incluyendo propina / numero de ventas confirmadas; cero si no hay ventas.',
    'visitas_finalizadas':'COUNT visitas FINALIZADA por fin_en, excluyendo cita cancelada/expirada/no asistida.',
    'clientas_unicas_atendidas':'COUNT DISTINCT clienta de visitas finalizadas del periodo.',
    'stock_bajo':'Articulos activos con existencia <= stock_minimo segun vw_stock_actual; foto actual.',
    'cumpleanios_proximos':'Clientas activas validadas con cumpleanos en los proximos 30 dias locales incluido hoy; 29/2 pasa a 28/2 en no bisiesto.',
    'clientas_inactivas':'Clientas activas validadas sin visita finalizada en los ultimos 90 dias; nunca atendidas incluidas.',
}


def sale_breakdown(sale, lines, consumptions, movements, verified):
    """Return exact additive amounts and independent revenue/cost quality flags."""
    warnings=set()
    with localcontext() as ctx:
        ctx.prec=48
        try:
            computed=sale_totals([{'cantidad':line.cantidad,'precio_unitario':line.precio_unitario,'descuento_linea':line.descuento_linea} for line in lines],sale.descuento_global,sale.propina)
            revenue_ok=bool(lines) and all(computed[field]==getattr(sale,field) for field in ('subtotal','total'))
        except FinanceError:
            computed={'netos_linea':[ZERO]*len(lines),'descuentos_globales_linea':[ZERO]*len(lines)}
            revenue_ok=False
        if not revenue_ok: warnings.add('TOTALES_NO_CONCILIAN')
        if sale.visita_id and (sale.visita.estado!='FINALIZADA' or sale.visita.clienta_id!=sale.clienta_id):
            revenue_ok=False
            warnings.add('VISITA_VENTA_INCONSISTENTE')
        rows=[]
        direct=ZERO
        fees=ZERO
        costs_ok=True
        for i,line in enumerate(lines):
            net=computed['netos_linea'][i]-computed['descuentos_globales_linea'][i]
            cost=ZERO
            if line.tipo=='PRODUCTO':
                if consumptions.get(line.pk): costs_ok=False
                cost=line.cantidad*line.costo_unitario_snapshot
                move=movements.get(('producto',line.pk))
                valid=move is not None and move.motivo=='VENTA_PRODUCTO' and move.articulo_id==line.articulo_id and move.cantidad_firmada==-line.cantidad and move.costo_unitario==line.costo_unitario_snapshot
                costs_ok=costs_ok and valid
            else:
                # An explicit Phase-5 confirmation proves that an empty actual-consumption list was reviewed.
                if sale.pk not in verified: costs_ok=False
                for consumption in consumptions.get(line.pk,[]):
                    cost+=consumption.cantidad*consumption.costo_unitario_snapshot
                    move=movements.get(('consumo',consumption.pk))
                    valid=move is not None and move.motivo=='CONSUMO_SERVICIO' and move.articulo_id==consumption.articulo_id and move.cantidad_firmada==-consumption.cantidad and move.costo_unitario==consumption.costo_unitario_snapshot
                    costs_ok=costs_ok and valid
            fee=commission(net,line.comision_porcentaje_snapshot) if line.tipo=='SERVICIO' else ZERO
            direct+=cost
            fees+=fee
            rows.append({'detalle_id':line.pk,'tipo':line.tipo,'servicio_id':line.servicio_id,'cantidad':line.cantidad,
                         'descripcion':line.descripcion_snapshot,'ingreso':net,'costo_exacto':cost,'comision':fee})
        if not costs_ok: warnings.add('COSTO_REAL_NO_VERIFICABLE')
        return {'rows':rows,'costo_exacto':direct,'comisiones':fees,'revenue_ok':revenue_ok,
                'costs_ok':costs_ok,'warnings':warnings}


def percentage_change(current, previous):
    return quantize((current-previous)*Decimal('100')/abs(previous)) if previous else None
