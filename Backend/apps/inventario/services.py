import hashlib
import json
from functools import wraps
from decimal import Decimal
from uuid import UUID
from django.db import IntegrityError, connection, transaction
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from apps.catalogo.services import CatalogConflict
from negocio import models as m
from .domain.politicas import MAX_QUANTITY, decimal_string, purchase_total
from . import selectors


def inventory_write(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        try:
            with transaction.atomic():
                return function(*args, **kwargs)
        except IntegrityError as exc:
            state = getattr(exc.__cause__, 'sqlstate', '')
            if state == '23505':
                raise CatalogConflict('La fuente ya tiene un movimiento o hay un conflicto de idempotencia.', 'movimiento_duplicado') from None
            if state in ('23503', '23514', '23502'):
                raise ValidationError('La operacion no cumple las referencias o restricciones de inventario.') from None
            raise
    return wrapped


def audit(user, obj, action, data):
    m.Auditoria.objects.create(usuario_id=user.pk, entidad=obj._meta.db_table, entidad_id=str(obj.pk),
                              accion=action, datos=data, creada_en=timezone.now())


def lock_articles(ids, require_active=True):
    ids = sorted(set(ids))
    rows = list(m.Articulos.objects.select_for_update().filter(pk__in=ids).order_by('id'))
    if len(rows) != len(ids):
        raise ValidationError({'articulo_id': 'Hay articulos inexistentes.'})
    if require_active and any(not row.activo for row in rows):
        raise CatalogConflict('La operacion requiere articulos activos.', 'articulo_inactivo')
    return {row.pk: row for row in rows}


def require_unit(article, unit_id):
    if article.unidad_id != unit_id:
        raise ValidationError({'unidad_id': 'La cantidad debe expresarse en la unidad de stock vigente; no hay conversion de empaques.'})


def locked_supplier(pk):
    if pk is None:
        return None
    obj = m.Proveedores.objects.select_for_update().filter(pk=pk).first()
    if obj is None:
        raise ValidationError({'proveedor_id': 'El proveedor no existe.'})
    if not obj.activo:
        raise CatalogConflict('El proveedor esta inactivo.', 'proveedor_inactivo')
    return obj


@inventory_write
def save_provider(data, user, pk=None):
    obj = get_object_or_404(m.Proveedores.objects.select_for_update(), pk=pk) if pk is not None else None
    if obj is None:
        obj = m.Proveedores.objects.create(**data)
        action = 'CREAR'
    else:
        for key, value in data.items():
            setattr(obj, key, value)
        if data:
            obj.save(update_fields=list(data))
        action = 'MODIFICAR'
    audit(user, obj, action, {'campos': sorted(data)})
    obj.refresh_from_db()
    return obj


@inventory_write
def set_provider_active(pk, active, user):
    obj = get_object_or_404(m.Proveedores.objects.select_for_update(), pk=pk)
    if obj.activo != active:
        obj.activo = active
        obj.save(update_fields=['activo'])
        audit(user, obj, 'REACTIVAR' if active else 'DESACTIVAR', {})
    return obj


def check_draft(obj):
    if obj.estado != 'BORRADOR':
        raise CatalogConflict('Solo se pueden editar compras BORRADOR.', 'estado_compra')


def verify_lines(lines, articles):
    for line in lines:
        require_unit(articles[line['articulo_id']], line['unidad_id'])


@inventory_write
def save_purchase(data, user, pk=None):
    obj = get_object_or_404(m.Compras.objects.select_for_update(), pk=pk) if pk is not None else None
    if obj:
        check_draft(obj)
        if m.MovimientosInventario.objects.filter(detalle_compra__compra_id=obj.pk).exists():
            raise CatalogConflict('Un borrador con movimientos requiere revision manual.', 'integridad_compra')
    data = dict(data)
    rows = data.pop('detalles', None)
    provider_id = data.get('proveedor_id', obj.proveedor_id if obj else None)
    locked_supplier(provider_id)
    if rows is not None:
        articles = lock_articles([row['articulo_id'] for row in rows])
        verify_lines(rows, articles)
        total = purchase_total(rows)
    else:
        total = obj.total if obj else Decimal('0.00')
    if obj is None:
        obj = m.Compras.objects.create(**data, estado='BORRADOR', total=total, creado_por_id=user.pk)
        action = 'CREAR'
    else:
        for field, value in data.items():
            setattr(obj, field, value)
        obj.total = total
        obj.save(update_fields=list(data) + ['total'])
        action = 'MODIFICAR'
    if rows is not None:
        m.DetallesCompra.objects.filter(compra_id=obj.pk).delete()
        m.DetallesCompra.objects.bulk_create([m.DetallesCompra(compra_id=obj.pk,
            **{key: value for key, value in row.items() if key != 'unidad_id'}) for row in rows])
    audit(user, obj, action, {'campos': sorted(data), 'reemplaza_detalles': rows is not None, 'numero_detalles': len(rows) if rows is not None else None})
    return selectors.purchase_detail(obj.pk)


def balance(article_id):
    return m.MovimientosInventario.objects.filter(articulo_id=article_id).aggregate(total=Sum('cantidad_firmada'))['total'] or Decimal('0')


def acquisition_cost_snapshot(article_id):
    """Historical received-purchase weighted cost, frozen to the ledger's four decimals."""
    from .domain.politicas import weighted_cost
    row = selectors.cost_annotations(m.Articulos.objects.filter(pk=article_id), 'id').get()
    cost = weighted_cost(row.compra_importe, row.compra_cantidad)
    return Decimal(decimal_string(cost, 4)) if cost is not None else None


def create_sale_movement(**fields):
    """Single stock engine for phase-5 issues; sources are protected by existing UNIQUE indexes."""
    return m.MovimientosInventario.objects.create(**fields)


@inventory_write
def issue_sale_stock(sale, product_lines, consumptions, user):
    if sale.estado != 'BORRADOR':
        raise CatalogConflict('La salida requiere venta BORRADOR bloqueada.', 'estado_venta')
    service_lines = {row.pk: row for row in m.DetallesVenta.objects.filter(venta_id=sale.pk, tipo='SERVICIO')}
    ids = [row.articulo_id for row in product_lines] + [entry.article_id for entry in consumptions]
    articles = lock_articles(ids)
    needs = {}
    for line in product_lines:
        if line.venta_id != sale.pk or line.tipo != 'PRODUCTO' or articles[line.articulo_id].tipo not in ('VENTA', 'AMBOS'):
            raise ValidationError('Linea de producto incompatible con la venta.')
        needs[line.articulo_id] = needs.get(line.articulo_id, Decimal('0')) + line.cantidad
    for entry in consumptions:
        if entry.detail_id not in service_lines or articles[entry.article_id].tipo not in ('INSUMO', 'AMBOS'):
            raise ValidationError('Consumo de servicio o tipo de articulo incompatible.')
        require_unit(articles[entry.article_id], entry.unit_id)
        needs[entry.article_id] = needs.get(entry.article_id, Decimal('0')) + entry.quantity
    costs = {}
    for article_id, needed in sorted(needs.items()):
        if balance(article_id) < needed:
            raise CatalogConflict('Stock insuficiente para productos y consumo real combinado.', 'stock_insuficiente')
        costs[article_id] = acquisition_cost_snapshot(article_id)
        if costs[article_id] is None:
            raise CatalogConflict('Falta costo de adquisicion verificable; no se inventa costo cero.', 'costo_no_disponible')
    created = []
    for line in product_lines:
        line.costo_unitario_snapshot = costs[line.articulo_id]
        line.save(update_fields=['costo_unitario_snapshot'])
        movement = create_sale_movement(articulo_id=line.articulo_id, motivo='VENTA_PRODUCTO',
            cantidad_firmada=-line.cantidad, costo_unitario=costs[line.articulo_id],
            detalle_venta_id=line.pk, registrado_por_id=user.pk)
        audit(user, movement, 'SALIDA_VENTA', {'venta_id': sale.pk, 'detalle_id': line.pk})
    for entry in consumptions:
        consumption = m.ConsumosServicio.objects.create(detalle_venta_id=entry.detail_id, articulo_id=entry.article_id,
            cantidad=entry.quantity, costo_unitario_snapshot=costs[entry.article_id])
        movement = create_sale_movement(articulo_id=entry.article_id, motivo='CONSUMO_SERVICIO',
            cantidad_firmada=-entry.quantity, costo_unitario=costs[entry.article_id],
            consumo_servicio_id=consumption.pk, registrado_por_id=user.pk)
        audit(user, movement, 'CONSUMO_REAL', {'venta_id': sale.pk, 'consumo_id': consumption.pk})
        created.append(consumption.pk)
    return {'costos_snapshot': costs, 'consumos_ids': created}


def verify_receipt(obj, rows):
    movements = list(m.MovimientosInventario.objects.filter(detalle_compra__compra_id=obj.pk))
    sources = {row.pk: row for row in rows}
    if not rows or len(movements) != len(rows):
        raise CatalogConflict('La recepcion existente no coincide con sus detalles.', 'integridad_compra')
    if obj.total != purchase_total([{'cantidad': row.cantidad, 'costo_unitario': row.costo_unitario} for row in rows]):
        raise CatalogConflict('El total no coincide con los detalles recibidos.', 'integridad_compra')
    for movement in movements:
        line = sources.get(movement.detalle_compra_id)
        if line is None or movement.motivo != 'COMPRA' or movement.articulo_id != line.articulo_id or movement.cantidad_firmada != line.cantidad or movement.costo_unitario != line.costo_unitario or movement.consumo_servicio_id is not None or movement.detalle_venta_id is not None:
            raise CatalogConflict('Hay movimientos incompatibles con la compra.', 'integridad_compra')


def create_purchase_movement(line, user):
    return m.MovimientosInventario.objects.create(articulo_id=line.articulo_id, motivo='COMPRA',
        cantidad_firmada=line.cantidad, costo_unitario=line.costo_unitario,
        detalle_compra_id=line.pk, registrado_por_id=user.pk)


@inventory_write
def receive_purchase(pk, user):
    obj = get_object_or_404(m.Compras.objects.select_for_update(), pk=pk)
    rows = list(m.DetallesCompra.objects.select_for_update().filter(compra_id=pk).order_by('id'))
    if obj.estado == 'RECIBIDA':
        verify_receipt(obj, rows)
        return selectors.purchase_detail(obj.pk)
    check_draft(obj)
    if not rows:
        raise ValidationError({'detalles': 'No se puede recibir una compra vacia.'})
    if m.MovimientosInventario.objects.filter(detalle_compra__compra_id=pk).exists():
        raise CatalogConflict('El borrador ya tiene movimientos; requiere revision.', 'integridad_compra')
    locked_supplier(obj.proveedor_id)
    lock_articles([row.articulo_id for row in rows])
    if any(row.vencimiento and row.vencimiento < timezone.localdate() for row in rows):
        raise ValidationError({'vencimiento': 'No se puede recibir mercaderia ya vencida.'})
    incoming = {}
    for row in rows:
        incoming[row.articulo_id] = incoming.get(row.articulo_id, Decimal('0')) + row.cantidad
    for article_id, quantity in incoming.items():
        if balance(article_id) + quantity > MAX_QUANTITY:
            raise ValidationError('Las existencias excederian NUMERIC(14,3).')
    obj.total = purchase_total([{'cantidad': row.cantidad, 'costo_unitario': row.costo_unitario} for row in rows])
    for row in rows:
        create_purchase_movement(row, user)
    obj.estado = 'RECIBIDA'
    obj.save(update_fields=['estado', 'total'])
    verify_receipt(obj, rows)
    audit(user, obj, 'RECIBIR', {'numero_movimientos': len(rows)})
    return selectors.purchase_detail(obj.pk)


@inventory_write
def cancel_purchase(pk, user):
    obj = get_object_or_404(m.Compras.objects.select_for_update(), pk=pk)
    if obj.estado == 'ANULADA':
        return selectors.purchase_detail(obj.pk)
    check_draft(obj)
    if m.MovimientosInventario.objects.filter(detalle_compra__compra_id=pk).exists():
        raise CatalogConflict('Un borrador con movimientos requiere revision.', 'integridad_compra')
    obj.estado = 'ANULADA'
    obj.save(update_fields=['estado'])
    audit(user, obj, 'ANULAR', {})
    return selectors.purchase_detail(obj.pk)


def normalize_idempotency_key(value):
    try:
        if not isinstance(value, str) or len(value) != 36:
            raise ValueError
        key = UUID(value)
        if key.int == 0:
            raise ValueError
        return str(key)
    except (ValueError, AttributeError, TypeError):
        raise ValidationError({'Idempotency-Key': 'Envie una UUID no nula de 36 caracteres.'}) from None


@inventory_write
def create_purchase_idempotent(data, user, idempotency_key):
    """Replay a creation intent using existing audit storage; no new tables or financial coupling."""
    key = normalize_idempotency_key(idempotency_key)
    def canonical(value):
        if isinstance(value, Decimal):
            return format(value, 'f')
        if hasattr(value, 'isoformat'):
            return value.isoformat()
        raise TypeError('Unsupported purchase payload type.')
    digest = hashlib.sha256(json.dumps(data, sort_keys=True, default=canonical).encode()).hexdigest()
    lock = int.from_bytes(hashlib.sha256(('purchase-create:'+str(user.pk)+':'+key).encode()).digest()[:8], 'big', signed=True)
    with connection.cursor() as cursor:
        cursor.execute('SELECT pg_advisory_xact_lock(%s)', [lock])
    previous = m.Auditoria.objects.filter(usuario_id=user.pk, entidad='compras',
        accion='CREAR_IDEMPOTENTE', datos__idempotency_key=key).first()
    if previous:
        if previous.datos['request_hash'] != digest:
            raise CatalogConflict('La clave ya fue usada con otra compra.', 'idempotencia_conflicto')
        return selectors.purchase_detail(previous.datos['compra_id']), False
    purchase = save_purchase(data, user)
    audit(user, purchase, 'CREAR_IDEMPOTENTE', {'idempotency_key':key,'request_hash':digest,'compra_id':purchase.pk})
    return purchase, True


def adjustment_result(obj, resulting_balance):
    return {'movimiento_id': obj.pk, 'articulo_id': obj.articulo_id, 'motivo': obj.motivo,
            'cantidad_firmada': decimal_string(obj.cantidad_firmada, 3),
            'saldo_resultante': resulting_balance, 'costo_unitario': decimal_string(obj.costo_unitario),
            'valoracion': 'NO_VALORIZADO', 'moneda': 'PEN'}


@inventory_write
def adjust_stock(data, user, idempotency_key):
    key = normalize_idempotency_key(idempotency_key)
    payload = {**data, 'cantidad': decimal_string(data['cantidad'], 3)}
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    lock = int.from_bytes(hashlib.sha256((str(user.pk) + ':' + key).encode()).digest()[:8], 'big', signed=True)
    with connection.cursor() as cursor:
        cursor.execute('SELECT pg_advisory_xact_lock(%s)', [lock])
    previous = m.Auditoria.objects.filter(usuario_id=user.pk, entidad='movimientos_inventario',
        accion='AJUSTAR', datos__idempotency_key=key).first()
    if previous:
        if previous.datos['request_hash'] != digest:
            raise CatalogConflict('La clave ya fue usada con otra solicitud.', 'idempotencia_conflicto')
        obj = get_object_or_404(m.MovimientosInventario, pk=previous.datos['movimiento_id'])
        return adjustment_result(obj, previous.datos['saldo_resultante']), False
    article = lock_articles([data['articulo_id']])[data['articulo_id']]
    require_unit(article, data['unidad_id'])
    current = balance(article.pk)
    quantity = data['cantidad'] if data['tipo'] == 'AJUSTE_ENTRADA' else -data['cantidad']
    resulting = current + quantity
    if resulting < 0:
        raise CatalogConflict('Existencias insuficientes para la salida.', 'stock_insuficiente')
    if resulting > MAX_QUANTITY:
        raise ValidationError('Las existencias excederian NUMERIC(14,3).')
    obj = m.MovimientosInventario.objects.create(articulo_id=article.pk, motivo=data['tipo'],
        cantidad_firmada=quantity, costo_unitario=Decimal('0'), registrado_por_id=user.pk,
        notas=data['justificacion'])
    obj.refresh_from_db()
    audit(user, obj, 'AJUSTAR', {'idempotency_key': key, 'request_hash': digest,
        'movimiento_id': obj.pk, 'saldo_resultante': decimal_string(resulting, 3), 'valoracion': 'NO_VALORIZADO'})
    return adjustment_result(obj, decimal_string(resulting, 3)), True

