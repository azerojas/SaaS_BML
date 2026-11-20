from functools import wraps
from django.db import IntegrityError, connection, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.exceptions import APIException, ValidationError, PermissionDenied
from negocio import models as m
from .entities import ENTITIES


class CatalogConflict(APIException):
    status_code = 409
    default_code = 'conflicto'

    def __init__(self, detail, code='conflicto'):
        self.default_code = code
        super().__init__(detail, code)


def catalog_write(function=None, *, with_agenda=False):
    if function is None:
        return lambda target: catalog_write(target, with_agenda=with_agenda)
    @wraps(function)
    def wrapped(*args, **kwargs):
        try:
            with transaction.atomic():
                # One shared lock orders cross-entity writes and avoids recipe/type/unit races.
                # Appropriate for a small administrative catalog; external SQL must follow the same rules.
                with connection.cursor() as cursor:
                    if with_agenda:
                        # Treatment staff changes share reservation locks, in the same order.
                        for key in (718302453, 718302451, 718302455):
                            cursor.execute('SELECT pg_advisory_xact_lock(%s)', [key])
                    cursor.execute('SELECT pg_advisory_xact_lock(718302452)')
                return function(*args, **kwargs)
        except IntegrityError as exc:
            state = getattr(exc.__cause__, 'sqlstate', '')
            if state == '23505':
                raise CatalogConflict('Ya existe un registro con ese nombre, slug, SKU o codigo.', 'duplicado') from None
            if state in ('23503', '23514', '23502'):
                raise ValidationError('La operacion no cumple las relaciones o restricciones del catalogo.') from None
            raise
    return wrapped


def audit(user, obj, action, data):
    m.Auditoria.objects.create(usuario_id=user.pk, entidad=obj._meta.db_table, entidad_id=str(obj.pk),
                              accion=action, datos=data, creada_en=timezone.now())


def require_reference(model, pk, field):
    if pk is not None and not model.objects.filter(pk=pk).exists():
        raise ValidationError({field: 'El registro relacionado no existe.'})


def unique_value(model, field, value, pk):
    if value is not None and model.objects.exclude(pk=pk).filter(**{field + '__iexact': value}).exists():
        raise CatalogConflict('Ya existe un registro con ese ' + field + '.', 'duplicado')


def assign_slug(model, data, obj):
    old = obj.slug if obj else None
    if old and 'slug' in data and data['slug'] != old:
        raise CatalogConflict('El slug existente es estable y no puede cambiarse.', 'slug_inmutable')
    if 'slug' in data:
        unique_value(model, 'slug', data['slug'], obj.pk if obj else None)
    elif not old and (not obj or data.get('visible_catalogo') is True):
        max_length = model._meta.get_field('slug').max_length
        root = slugify(data.get('nombre', obj.nombre if obj else '')) or model._meta.db_table
        candidate = root[:max_length]
        suffix = 2
        while model.objects.filter(slug__iexact=candidate).exists():
            tail = '-' + str(suffix)
            candidate = root[:max_length - len(tail)] + tail
            suffix += 1
        data['slug'] = candidate


def article_has_quantity_history(pk):
    return any(model.objects.filter(articulo_id=pk).exists() for model in
               (m.RecetasServicio, m.DetallesCompra, m.MovimientosInventario, m.ConsumosServicio, m.DetallesVenta))


@catalog_write(with_agenda=True)
def save_entity(kind, data, user, pk=None):
    model = ENTITIES[kind][0]
    obj = get_object_or_404(model.objects.select_for_update(), pk=pk) if pk is not None else None
    data = dict(data)
    professional_ids = data.pop('profesionales_ids', None) if kind == 'servicios' else None
    if professional_ids is not None:
        if not user.has_perm('agenda.manage_professionals'):
            raise PermissionDenied('Se necesita permiso para asignar las personas que atienden el tratamiento.')
        existing = set(m.ProfesionalServicios.objects.filter(servicio_id=pk).values_list('profesional_id', flat=True)) if pk else set()
        active = set(m.Profesionales.objects.filter(pk__in=professional_ids, activa=True).values_list('pk', flat=True))
        if set(professional_ids) - existing - active:
            raise ValidationError({'profesionales_ids': 'Selecciona personas activas registradas.'})
        removed = existing - set(professional_ids)
        if removed:
            from apps.agenda.domain.rules import ACTIVE
            from apps.agenda.application.public_booking import holds, installed
            booked = m.CitaServicios.objects.filter(servicio_id=pk, cita__profesional_id__in=removed,
                cita__estado__in=ACTIVE, cita__fin_en__gt=timezone.now()).exists()
            pending = installed() and holds().filter(profesional_id__in=removed, servicios__contains=[{'servicio_id':obj.pk}]).exists()
            if booked or pending:
                raise CatalogConflict('Reprograma las citas y solicitudes pendientes antes de quitar a la persona que las atiende.', 'persona_con_reservas')
    defaults = {
        'categorias-servicio': {'orden': 0, 'activa': True},
        'servicios': {'activo': True, 'visible_catalogo': False, 'reservable_online': False,
                      'requiere_anticipo': False, 'orden': 0, 'duracion_minutos': None},
        'articulos': {'activo': True, 'visible_catalogo': False, 'precio_venta': '0.00',
                      'stock_minimo': '0.000', 'orden': 0},
    }
    if obj is None:
        data = {**defaults.get(kind, {}), **data}
    if kind in ('categorias-servicio', 'categorias-articulo', 'servicios') and 'nombre' in data:
        unique_value(model, 'nombre', data['nombre'], obj.pk if obj else None)
    if kind == 'unidades' and 'codigo' in data:
        unique_value(model, 'codigo', data['codigo'], obj.pk if obj else None)
        if obj and data['codigo'] != obj.codigo and m.Articulos.objects.filter(unidad_id=obj.pk).exists():
            raise CatalogConflict('No se puede cambiar el codigo de una unidad usada por articulos.', 'unidad_en_uso')
    if kind in ('servicios', 'articulos'):
        category_model = m.CategoriasServicio if kind == 'servicios' else m.CategoriasArticulo
        if 'categoria_id' in data:
            require_reference(category_model, data['categoria_id'], 'categoria_id')
        assign_slug(model, data, obj)
        active = data.get('activo', obj.activo if obj else True)
        visible = data.get('visible_catalogo', obj.visible_catalogo if obj else False)
        if not active:
            if data.get('visible_catalogo') is True:
                raise ValidationError({'visible_catalogo': 'Solo se puede publicar un registro activo.'})
            data['visible_catalogo'] = False
        if kind == 'servicios':
            reservable = data.get('reservable_online', obj.reservable_online if obj else False)
            duration = data.get('duracion_minutos', obj.duracion_minutos if obj else None)
            if reservable and duration is None:
                raise ValidationError({'duracion_minutos': 'Es obligatoria si reservable_online es true.'})
        else:
            if 'unidad_id' in data:
                require_reference(m.UnidadesMedida, data['unidad_id'], 'unidad_id')
                if obj and data['unidad_id'] != obj.unidad_id and article_has_quantity_history(obj.pk):
                    raise CatalogConflict('La unidad tiene cantidades historicas o recetas; requiere migracion controlada.', 'unidad_en_uso')
            if 'sku' in data:
                unique_value(model, 'sku', data['sku'], obj.pk if obj else None)
            article_type = data.get('tipo', obj.tipo if obj else None)
            if visible and active and article_type == 'INSUMO':
                raise ValidationError({'visible_catalogo': 'Un insumo no se publica como producto.'})
            if obj and article_type == 'VENTA' and m.RecetasServicio.objects.filter(articulo_id=obj.pk).exists():
                raise CatalogConflict('El articulo forma parte de recetas y debe conservar tipo INSUMO o AMBOS.', 'articulo_en_receta')
    if obj:
        for key, value in data.items():
            setattr(obj, key, value)
        if data:
            obj.save(update_fields=list(data))
        action = 'MODIFICAR'
    else:
        obj = model.objects.create(**data)
        action = 'CREAR'
    if professional_ids is not None:
        m.ProfesionalServicios.objects.filter(servicio_id=obj.pk).exclude(profesional_id__in=professional_ids).delete()
        m.ProfesionalServicios.objects.bulk_create([m.ProfesionalServicios(servicio_id=obj.pk, profesional_id=identifier)
            for identifier in professional_ids if identifier not in existing])
    audit(user, obj, action, {'campos': sorted([*data, *(['profesionales_ids'] if professional_ids is not None else [])])})
    obj.refresh_from_db()
    return obj


@catalog_write
def set_active(kind, pk, active, user):
    model = ENTITIES[kind][0]
    obj = get_object_or_404(model.objects.select_for_update(), pk=pk)
    field = 'activa' if kind == 'categorias-servicio' else 'activo'
    fields = []
    if getattr(obj, field) != active:
        setattr(obj, field, active)
        fields.append(field)
    if not active and hasattr(obj, 'visible_catalogo') and obj.visible_catalogo:
        obj.visible_catalogo = False
        fields.append('visible_catalogo')
    if fields:
        obj.save(update_fields=fields)
        audit(user, obj, 'REACTIVAR' if active else 'DESACTIVAR', {'campos': fields})
    obj.refresh_from_db()
    return obj


def read_recipe(pk):
    get_object_or_404(m.Servicios, pk=pk)
    from .serializers import InsumoOutput
    rows = m.RecetasServicio.objects.filter(servicio_id=pk).select_related('articulo__unidad').order_by('articulo__nombre', 'articulo_id')
    return {'servicio_id': int(pk), 'insumos': InsumoOutput(rows, many=True).data, 'costo_estimado': None, 'moneda': 'PEN'}


@catalog_write
def replace_recipe(pk, data, user):
    parent = get_object_or_404(m.Servicios.objects.select_for_update(), pk=pk)
    rows = data['insumos']
    ids = [row['articulo_id'] for row in rows]
    if len(ids) != len(set(ids)):
        raise ValidationError({'insumos': 'No repitas articulos en una receta.'})
    articles = {obj.pk: obj for obj in m.Articulos.objects.select_for_update().filter(pk__in=ids).order_by('pk')}
    for row in rows:
        obj = articles.get(row['articulo_id'])
        if obj is None or not obj.activo or obj.tipo not in ('INSUMO', 'AMBOS'):
            raise ValidationError({'insumos': 'Cada articulo debe existir, estar activo y ser INSUMO o AMBOS.'})
    m.RecetasServicio.objects.filter(servicio_id=pk).delete()
    m.RecetasServicio.objects.bulk_create([m.RecetasServicio(servicio_id=pk, **row) for row in rows])
    audit(user, parent, 'RECETA_REEMPLAZAR', {'numero_insumos': len(rows)})
    return read_recipe(pk)


def parent_for_image(obj):
    return ('servicios', obj.servicio_id) if obj.servicio_id is not None else ('articulos', obj.articulo_id)


def image_rows(kind, pk):
    field = 'servicio_id' if kind == 'servicios' else 'articulo_id'
    return m.ImagenesCatalogo.objects.filter(**{field: pk}).order_by('orden', 'id')


@catalog_write
def add_image(kind, pk, data, user):
    parent = get_object_or_404(ENTITIES[kind][0].objects.select_for_update(), pk=pk)
    rows = image_rows(kind, pk)
    data = dict(data)
    principal = data.pop('es_principal', not rows.filter(es_principal=True).exists())
    if principal:
        rows.filter(es_principal=True).update(es_principal=False)
    field = 'servicio_id' if kind == 'servicios' else 'articulo_id'
    obj = m.ImagenesCatalogo.objects.create(**{field: pk}, **data, es_principal=principal)
    audit(user, parent, 'IMAGEN_AGREGAR', {'imagen_id': obj.pk})
    obj.refresh_from_db()
    return obj


@catalog_write
def set_primary_image(pk, user):
    obj = get_object_or_404(m.ImagenesCatalogo, pk=pk)
    kind, parent_pk = parent_for_image(obj)
    parent = get_object_or_404(ENTITIES[kind][0].objects.select_for_update(), pk=parent_pk)
    image_rows(kind, parent_pk).filter(es_principal=True).exclude(pk=obj.pk).update(es_principal=False)
    obj.es_principal = True
    obj.save(update_fields=['es_principal'])
    audit(user, parent, 'IMAGEN_PRINCIPAL', {'imagen_id': obj.pk})
    return obj


@catalog_write
def delete_image(pk, user):
    obj = get_object_or_404(m.ImagenesCatalogo, pk=pk)
    kind, parent_pk = parent_for_image(obj)
    parent = get_object_or_404(ENTITIES[kind][0].objects.select_for_update(), pk=parent_pk)
    was_primary, image_id = obj.es_principal, obj.pk
    obj.delete()
    if was_primary:
        replacement = image_rows(kind, parent_pk).first()
        if replacement:
            replacement.es_principal = True
            replacement.save(update_fields=['es_principal'])
    audit(user, parent, 'IMAGEN_ELIMINAR', {'imagen_id': image_id})


@catalog_write
def update_image(pk, data, user):
    obj = get_object_or_404(m.ImagenesCatalogo.objects.select_for_update(), pk=pk)
    kind, parent_pk = parent_for_image(obj)
    parent = get_object_or_404(ENTITIES[kind][0].objects.select_for_update(), pk=parent_pk)
    for field, value in data.items():
        setattr(obj, field, value)
    if data:
        obj.save(update_fields=list(data))
        audit(user, parent, 'IMAGEN_MODIFICAR', {'imagen_id': obj.pk, 'campos': sorted(data)})
    return obj

