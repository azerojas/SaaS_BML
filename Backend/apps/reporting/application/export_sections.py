"""Additional export sections, read within the report's existing snapshot."""
from decimal import Decimal
from django.db.models import Count, Exists, OuterRef, Q, Sum
from django.db.models.functions import TruncDate
from apps.finanzas.models import Refund
from apps.reporting.domain.periods import ZONE
from apps.reporting.infrastructure import repositories as repo
from negocio import models as m


def visits(filters):
    source=m.Visitas.objects.filter(inicio_en__gte=filters.start,inicio_en__lt=filters.end)
    if filters.cohort_filtered:
        appointments=m.Citas.objects.filter(visita_id=OuterRef('pk'))
        lines=m.DetallesVenta.objects.filter(venta__visita_id=OuterRef('pk'))
        if filters.servicio_id:
            appointments=appointments.filter(citaservicios__servicio_id=filters.servicio_id)
            lines=lines.filter(servicio_id=filters.servicio_id)
        if filters.profesional_id:
            appointments=appointments.filter(profesional_id=filters.profesional_id)
            lines=lines.filter(profesional_id=filters.profesional_id)
        source=source.filter(Exists(appointments)|Exists(lines))
    return [{'visita_id':row.pk,'clienta_id':row.clienta_id,'nombre':row.clienta.nombres+' '+row.clienta.apellidos,
        'inicio_en':row.inicio_en,'fin_en':row.fin_en,'estado':row.estado}
        for row in repo.bounded(source.select_related('clienta').order_by('inicio_en','id'),10000)]


def outgoings(filters):
    rows=[{'fecha':row['fecha'],'tipo':'Gasto operativo','categoria':row['categoria__nombre'],
        'metodo':None,'cantidad':row['cantidad'],'monto':row['monto']}
        for row in repo.bounded(repo.expense_rows(filters).values('fecha','categoria__nombre')
            .annotate(monto=Sum('monto'),cantidad=Count('id')).order_by('fecha','categoria__nombre'),10000)]
    refunds=Refund.objects.filter(creada_en__gte=filters.start,creada_en__lt=filters.end)
    if filters.metodo:refunds=refunds.filter(metodo=filters.metodo)
    if filters.cohort_filtered:
        sales=repo.sale_scope(filters,dated=False)
        refunds=refunds.filter(Q(pago_id__in=m.Pagos.objects.filter(venta__in=sales).values('pk'))|
            Q(anticipo_id__in=m.AnticiposCita.objects.filter(cita__visita__ventas__in=sales).values('pk')))
    for row in repo.bounded(refunds.annotate(fecha=TruncDate('creada_en',tzinfo=ZONE))
            .values('fecha','metodo').annotate(monto=Sum('monto'),cantidad=Count('id')).order_by('fecha','metodo'),10000):
        rows.append({'fecha':row['fecha'],'tipo':'Reembolso','categoria':'Devolución a clientas',
            'metodo':row['metodo'],'cantidad':row['cantidad'],'monto':row['monto']})
    return sorted(rows,key=lambda row:(row['fecha'],row['tipo'],row['categoria']))


def treatment_demand(filters, sold):
    source=m.CitaServicios.objects.filter(cita__estado__in=['PROGRAMADA','CONFIRMADA','COMPLETADA'])
    if filters.servicio_id:source=source.filter(servicio_id=filters.servicio_id)
    if filters.profesional_id:source=source.filter(cita__profesional_id=filters.profesional_id)
    demand={row['servicio_id']:row for row in repo.bounded(source.filter(cita__inicio_en__gte=filters.start,cita__inicio_en__lt=filters.end).values('servicio_id','servicio__nombre')
        .annotate(reservas=Count('cita_id',distinct=True),personas=Count('cita__clienta_id',distinct=True)),10000)}
    received={row['servicio_id']:row for row in repo.bounded(source.filter(cita__creada_en__gte=filters.start,cita__creada_en__lt=filters.end)
        .values('servicio_id','servicio__nombre').annotate(cantidad=Count('cita_id',distinct=True)),10000)}
    sales={row['servicio_id']:row for row in sold['results']}
    result=[]
    for identifier in set(demand)|set(sales)|set(received):
        booked,billed=demand.get(identifier,{}),sales.get(identifier,{})
        result.append({'tratamiento':billed.get('descripcion_snapshot') or booked.get('servicio__nombre') or received.get(identifier,{}).get('servicio__nombre','Tratamiento sin nombre'),
            'reservas_recibidas':received.get(identifier,{}).get('cantidad',0),
            'reservas':booked.get('reservas',0),'personas':booked.get('personas',0),
            'cantidad':billed.get('cantidad',Decimal('0.000')),'ingreso':billed.get('ingreso',Decimal('0.00')),
            'numero_ventas':billed.get('numero_ventas',0)})
    return sorted(result,key=lambda row:(-row['reservas_recibidas'],-row['reservas'],-row['cantidad'],row['tratamiento']))
