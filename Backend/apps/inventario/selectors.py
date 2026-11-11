from datetime import datetime, time, timedelta
from decimal import Decimal, localcontext
from django.db.models import DecimalField, Exists, ExpressionWrapper, F, OuterRef, Prefetch, Subquery, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.exceptions import ValidationError
from apps.catalogo.selectors import boolean_param, integer_param, search
from .domain.politicas import COST_POLICY, decimal_string, weighted_cost
from negocio import models as m


def date_range(qs, params, field='fecha'):
    dates = {}
    for key in ('desde', 'hasta'):
        if key in params:
            try:
                value = parse_date(params[key])
                if value is None or value.year >= 9999:
                    raise ValueError
            except (ValueError, TypeError):
                raise ValidationError({key: 'Usa una fecha YYYY-MM-DD valida.'})
            dates[key] = value
    if 'desde' in dates and 'hasta' in dates and dates['desde'] > dates['hasta']:
        raise ValidationError('desde no puede ser posterior a hasta.')
    zone = timezone.get_default_timezone()
    if 'desde' in dates:
        qs = qs.filter(**{field + '__gte': timezone.make_aware(datetime.combine(dates['desde'], time.min), zone)})
    if 'hasta' in dates:
        qs = qs.filter(**{field + '__lt': timezone.make_aware(datetime.combine(dates['hasta'] + timedelta(days=1), time.min), zone)})
    return qs


def providers(params):
    qs = search(m.Proveedores.objects.all(), params, ['nombre', 'ruc', 'telefono'])
    active = boolean_param(params, 'activo')
    return (qs if active is None else qs.filter(activo=active)).order_by('nombre', 'id')


def purchase_details():
    return m.DetallesCompra.objects.select_related('articulo__unidad').order_by('id')


def purchase_detail(pk):
    return get_object_or_404(m.Compras.objects.select_related('proveedor').prefetch_related(
        Prefetch('detallescompra_set', queryset=purchase_details())), pk=pk)


def purchases(params):
    qs = search(m.Compras.objects.select_related('proveedor'), params, ['numero_documento'])
    if 'estado' in params:
        if params['estado'] not in ('BORRADOR', 'RECIBIDA', 'ANULADA'):
            raise ValidationError({'estado': 'Usa BORRADOR, RECIBIDA o ANULADA.'})
        qs = qs.filter(estado=params['estado'])
    provider = integer_param(params, 'proveedor')
    if provider is not None:
        qs = qs.filter(proveedor_id=provider)
    return date_range(qs, params).order_by('-fecha', '-id')


def movements(params):
    qs = search(m.MovimientosInventario.objects.select_related('articulo__unidad', 'detalle_compra'), params, ['articulo__nombre'])
    for param, field in [('articulo', 'articulo_id'), ('compra', 'detalle_compra__compra_id')]:
        value = integer_param(params, param)
        if value is not None:
            qs = qs.filter(**{field: value})
    if 'motivo' in params:
        if params['motivo'] not in ('COMPRA', 'AJUSTE_ENTRADA', 'AJUSTE_SALIDA', 'DEVOLUCION', 'CONSUMO_SERVICIO', 'VENTA_PRODUCTO'):
            raise ValidationError({'motivo': 'Motivo desconocido.'})
        qs = qs.filter(motivo=params['motivo'])
    return date_range(qs, params).order_by('fecha', 'id')


def cost_annotations(qs, article_field):
    entries = m.MovimientosInventario.objects.filter(articulo_id=OuterRef(article_field),
        motivo='COMPRA', cantidad_firmada__gt=0, detalle_compra__compra__estado='RECIBIDA')
    value = ExpressionWrapper(F('cantidad_firmada') * F('costo_unitario'),
                               output_field=DecimalField(max_digits=38, decimal_places=7))
    grouped = entries.values('articulo_id').annotate(importe=Sum(value), cantidad=Sum('cantidad_firmada'))
    return qs.annotate(compra_importe=Subquery(grouped.values('importe')),
                       compra_cantidad=Subquery(grouped.values('cantidad')))


def stock(params):
    articles = m.Articulos.objects.all()
    active = boolean_param(params, 'activo') if 'activo' in params else True
    if active is not None:
        articles = articles.filter(activo=active)
    for param, field in [('categoria', 'categoria_id'), ('articulo', 'id')]:
        value = integer_param(params, param)
        if value is not None:
            articles = articles.filter(**{field: value})
    purchase_id = integer_param(params, 'compra')
    if purchase_id is not None:
        articles = articles.filter(pk__in=m.DetallesCompra.objects.filter(compra_id=purchase_id).values('articulo_id'))
    if 'tipo' in params:
        if params['tipo'] not in ('INSUMO', 'VENTA', 'AMBOS'):
            raise ValidationError({'tipo': 'Tipo invalido.'})
        articles = articles.filter(tipo=params['tipo'])
    qs = search(m.VwStockActual.objects.filter(pk__in=articles.values('pk')), params, ['nombre', 'unidad'])
    qs = qs.annotate(tiene_movimientos=Exists(m.MovimientosInventario.objects.filter(articulo_id=OuterRef('pk'))))
    for param, field in [('bajo_minimo', 'bajo_minimo'), ('sin_movimientos', 'tiene_movimientos')]:
        value = boolean_param(params, param)
        if value is not None:
            qs = qs.filter(**{field: not value if param == 'sin_movimientos' else value})
    metadata = m.Articulos.objects.filter(pk=OuterRef('articulo_id'))
    qs = qs.annotate(sku=Subquery(metadata.values('sku')[:1]),
        categoria_id=Subquery(metadata.values('categoria_id')[:1]),
        categoria_nombre=Subquery(metadata.values('categoria__nombre')[:1]),
        activo=Subquery(metadata.values('activo')[:1]),
        unidad_id=Subquery(metadata.values('unidad_id')[:1]))
    return cost_annotations(qs, 'articulo_id').order_by('nombre', 'articulo_id')


def stock_summary():
    active = stock({'activo':'true'})
    return {'articulos_activos':active.count(), 'bajo_minimo':active.filter(bajo_minimo=True).count(),
            'agotados':active.filter(existencia__lte=0).count(),
            'sin_movimientos':active.filter(tiene_movimientos=False).count()}


def recipe_uses(params):
    article_id = integer_param(params, 'articulo')
    if article_id is None:
        raise ValidationError({'articulo':'Selecciona un articulo.'})
    get_object_or_404(m.Articulos, pk=article_id)
    return m.RecetasServicio.objects.filter(articulo_id=article_id).select_related('servicio','articulo__unidad').order_by('servicio__nombre','servicio_id')


def expiry_alerts(params):
    days = integer_param(params, 'dias') if 'dias' in params else 30
    if days > 365:
        raise ValidationError({'dias': 'Maximo 365 dias.'})
    today = timezone.localdate()
    qs = purchase_details().filter(compra__estado='RECIBIDA', vencimiento__lte=today + timedelta(days=days))
    if 'estado' in params:
        if params['estado'] == 'vencido':
            qs = qs.filter(vencimiento__lt=today)
        elif params['estado'] == 'proximo':
            qs = qs.filter(vencimiento__gte=today)
        elif params['estado'] != 'all':
            raise ValidationError({'estado': 'Usa vencido, proximo o all.'})
    article = integer_param(params, 'articulo')
    if article is not None:
        qs = qs.filter(articulo_id=article)
    return qs.order_by('vencimiento', 'id')


def recipe_cost(service_id):
    get_object_or_404(m.Servicios, pk=service_id)
    rows = cost_annotations(m.RecetasServicio.objects.filter(servicio_id=service_id).select_related('articulo__unidad'), 'articulo_id').order_by('articulo_id')
    results, total, complete = [], Decimal('0'), True
    with localcontext() as ctx:
        ctx.prec = 48
        for row in rows:
            cost = weighted_cost(row.compra_importe, row.compra_cantidad)
            line = cost * row.cantidad_estimada if cost is not None else None
            if line is None:
                complete = False
            else:
                total += line
            results.append({'articulo_id': row.articulo_id, 'nombre': row.articulo.nombre,
                'unidad': row.articulo.unidad.codigo, 'cantidad_estimada': decimal_string(row.cantidad_estimada, 3),
                'costo_unitario_estimado': decimal_string(cost), 'costo_linea_estimado': decimal_string(line, 2)})
    return {'servicio_id': int(service_id), 'politica_costeo': COST_POLICY, 'moneda': 'PEN',
            'insumos': results, 'costo_estimado': decimal_string(total, 2) if complete and results else None,
            'completo': bool(complete and results),
            'advertencia': 'Estimado de compras historicas; no es costo contable, FIFO ni disponibilidad por lote.'}

