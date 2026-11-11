from django.db.models import Q
from rest_framework.exceptions import ValidationError
from negocio import models as m
from apps.clientas.selectors import ACCENTS, PLAIN
from django.db.models import CharField, F, Func, Value
from .entities import ENTITIES


def integer_param(params, name):
    if name not in params:
        return None
    try:
        value = int(params[name])
        if value < 0 or value > 9223372036854775807:
            raise ValueError
        return value
    except (ValueError, TypeError):
        raise ValidationError({name: 'Usa un entero no negativo.'})


def boolean_param(params, name):
    value = params.get(name, 'all')
    if value not in ('true', 'false', 'all'):
        raise ValidationError({name: 'Usa true, false o all.'})
    return None if value == 'all' else value == 'true'


def search(queryset, params, fields):
    if 'ordering' in params:
        raise ValidationError({'ordering': 'El orden del catalogo es fijo.'})
    value = ' '.join(params.get('search', '').split())
    if len(value) > 200:
        raise ValidationError({'search': 'Maximo 200 caracteres.'})
    aliases = {field + '_search': Func(F(field), Value(ACCENTS), Value(PLAIN),
                    function='translate', output_field=CharField()) for field in fields}
    queryset = queryset.alias(**aliases)
    for word in value.translate(str.maketrans(ACCENTS, PLAIN)).split():
        condition = Q()
        for field in fields:
            condition |= Q(**{field + '_search__icontains': word})
        queryset = queryset.filter(condition)
    return queryset


def admin_list(kind, params):
    model = ENTITIES[kind][0]
    qs = model.objects.all()
    if kind == 'servicios':
        qs = qs.select_related('categoria')
    elif kind == 'articulos':
        qs = qs.select_related('categoria', 'unidad')
    fields = {field.name for field in model._meta.fields}
    search_fields = ['nombre'] + (['sku'] if kind == 'articulos' else ['codigo'] if kind == 'unidades' else [])
    qs = search(qs, params, search_fields)
    for param, field in [('activo', 'activo' if 'activo' in fields else 'activa'), ('visible_catalogo', 'visible_catalogo')]:
        if param in params:
            if field not in fields:
                raise ValidationError({param: 'Este recurso no tiene ese filtro.'})
            value = boolean_param(params, param)
            if value is not None:
                qs = qs.filter(**{field: value})
    for param, field in [('categoria', 'categoria_id'), ('orden', 'orden')]:
        if param in params:
            if field.replace('_id', '') not in fields:
                raise ValidationError({param: 'Este recurso no tiene ese filtro.'})
            qs = qs.filter(**{field: integer_param(params, param)})
    if 'tipo' in params:
        if kind != 'articulos' or params['tipo'] not in ('INSUMO', 'VENTA', 'AMBOS'):
            raise ValidationError({'tipo': 'Usa INSUMO, VENTA o AMBOS para articulos.'})
        qs = qs.filter(tipo=params['tipo'])
    return qs.order_by(*(['orden'] if 'orden' in fields else []), 'nombre', 'id')


def public_services(params):
    ids = m.Servicios.objects.filter(Q(categoria__isnull=True) | Q(categoria__activa=True))
    ids = ids.exclude(slug__isnull=True).exclude(slug='')
    category = integer_param(params, 'categoria')
    if category is not None:
        ids = ids.filter(categoria_id=category)
    qs = m.VwCatalogoServicios.objects.filter(pk__in=ids.values('pk'))
    order = integer_param(params, 'orden')
    if order is not None:
        qs = qs.filter(orden=order)
    return search(qs, params, ['nombre', 'categoria']).order_by('orden', 'nombre', 'id')


def public_products(params):
    ids = m.Articulos.objects.exclude(slug__isnull=True).exclude(slug='')
    category = integer_param(params, 'categoria')
    if category is not None:
        ids = ids.filter(categoria_id=category)
    qs = m.VwCatalogoArticulos.objects.filter(pk__in=ids.values('pk'))
    order = integer_param(params, 'orden')
    if order is not None:
        qs = qs.filter(orden=order)
    return search(qs, params, ['nombre', 'categoria']).order_by('orden', 'nombre', 'id')


def stock_list(params):
    qs = search(m.VwStockActual.objects.all(), params, ['nombre', 'unidad'])
    if 'tipo' in params:
        if params['tipo'] not in ('INSUMO', 'VENTA', 'AMBOS'):
            raise ValidationError({'tipo': 'Tipo invalido.'})
        qs = qs.filter(tipo=params['tipo'])
    article_id = integer_param(params, 'articulo')
    if article_id is not None:
        qs = qs.filter(articulo_id=article_id)
    return qs.order_by('nombre', 'articulo_id')

