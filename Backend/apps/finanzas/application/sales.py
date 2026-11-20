from decimal import Decimal, localcontext
from django.shortcuts import get_object_or_404
from django.utils import timezone
from apps.inventario import services as inventory
from apps.finanzas.domain.commands import ActualConsumption
from apps.finanzas.domain.errors import FinanceError
from apps.finanzas.domain.money import ZERO, COST_POLICY, money, sale_totals, quantize
from apps.finanzas.models import AdvanceApplication
from negocio import models as m
from .audit import record
from . import selectors


def lock_sale(pk, draft=False):
    sale = get_object_or_404(m.Ventas.objects.select_for_update(), pk=pk)
    if draft and sale.estado != 'BORRADOR':
        raise FinanceError('estado_venta', 'La operacion requiere venta BORRADOR.')
    return sale


def totals(sale):
    lines = list(m.DetallesVenta.objects.filter(venta_id=sale.pk).order_by('id'))
    return sale_totals([{'cantidad': row.cantidad, 'precio_unitario': row.precio_unitario, 'descuento_linea': row.descuento_linea}
                        for row in lines], sale.descuento_global, sale.propina)


def recalculate(sale):
    result = totals(sale)
    for field in ('subtotal', 'descuento_global', 'propina', 'total'):
        setattr(sale, field, result[field])
    sale.save(update_fields=['subtotal', 'descuento_global', 'propina', 'total'])


def validate_visit(sale):
    if sale.visita_id:
        visit = get_object_or_404(m.Visitas.objects.select_for_update(), pk=sale.visita_id)
        if visit.estado != 'ABIERTA' or visit.clienta_id != sale.clienta_id:
            raise FinanceError('visita_incompatible', 'La visita debe estar abierta y corresponder a la ficha de venta.')
        return visit
    return None


def clean_draft_sources(sale):
    if m.Pagos.objects.filter(venta_id=sale.pk).exists() or AdvanceApplication.objects.filter(venta_id=sale.pk).exists() or m.AnticiposCita.objects.filter(venta_id=sale.pk).exists():
        raise FinanceError('fuentes_financieras', 'Un borrador con fuentes de cobro requiere conciliacion.')
    if m.ConsumosServicio.objects.filter(detalle_venta__venta_id=sale.pk).exists() or m.MovimientosInventario.objects.filter(detalle_venta__venta_id=sale.pk).exists():
        raise FinanceError('integridad_venta', 'Un borrador con salidas o consumos requiere conciliacion.')


def update_lines(sale, incoming, actor, appointment_prices=None):
    clean_draft_sources(sale)
    existing = {row.pk: row for row in m.DetallesVenta.objects.select_for_update().filter(venta_id=sale.pk)}
    seen, kept = set(), []
    for data in incoming:
        identifier = data.get('id')
        if identifier is not None and (identifier in seen or identifier not in existing):
            raise FinanceError('linea_invalida', 'ID de linea repetido o ajeno a la venta.', 'invalid')
        seen.add(identifier)
        obj = existing.get(identifier)
        kind = data['tipo']
        reference = data.get('servicio_id') if kind == 'SERVICIO' else data.get('articulo_id')
        if kind == 'SERVICIO' and sale.visita_id is None:
            raise FinanceError('servicio_sin_visita', 'Los servicios requieren una visita; mostrador admite productos.', 'invalid')
        model = m.Servicios if kind == 'SERVICIO' else m.Articulos
        item = get_object_or_404(model, pk=reference)
        if not item.activo or (kind == 'PRODUCTO' and item.tipo not in ('VENTA', 'AMBOS')):
            raise FinanceError('item_inactivo', 'El item no esta activo o no es vendible.')
        if obj and (obj.tipo != kind or (obj.servicio_id if kind == 'SERVICIO' else obj.articulo_id) != reference):
            raise FinanceError('linea_invalida', 'Para cambiar tipo o referencia retira la linea y crea una nueva.', 'invalid')
        quantity = data['cantidad']
        if kind == 'SERVICIO' and quantity != quantity.to_integral_value():
            raise FinanceError('cantidad_servicio', 'La cantidad de servicios debe ser entera.', 'invalid')
        if kind == 'PRODUCTO':
            inventory.require_unit(item, data.get('unidad_id'))
        catalog_price = item.precio_base if kind == 'SERVICIO' else item.precio_venta
        if kind == 'SERVICIO' and appointment_prices is not None:
            catalog_price = appointment_prices.get(reference, catalog_price)
        price = obj.precio_unitario if obj else catalog_price
        if 'precio_unitario' in data:
            if not actor.has_perm('finanzas.override_price'):
                raise FinanceError('precio_no_autorizado', 'Falta permiso de precio excepcional.', 'forbidden')
            if not data.get('motivo_precio'):
                raise FinanceError('motivo_precio_requerido', 'Justifica el precio excepcional.', 'invalid')
            price = data['precio_unitario']
        professional_id = data.get('profesional_id', obj.profesional_id if obj else None)
        percentage = ZERO
        if kind == 'SERVICIO' and professional_id:
            professional = get_object_or_404(m.Profesionales, pk=professional_id, activa=True)
            percentage = obj.comision_porcentaje_snapshot if obj and obj.profesional_id == professional_id else professional.comision_porcentaje
        fields = {'tipo': kind, 'servicio_id': reference if kind == 'SERVICIO' else None,
                  'articulo_id': reference if kind == 'PRODUCTO' else None, 'profesional_id': professional_id,
                  'descripcion_snapshot': obj.descripcion_snapshot if obj else item.nombre,
                  'cantidad': quantity, 'precio_unitario': price, 'descuento_linea': data.get('descuento_linea', ZERO),
                  'comision_porcentaje_snapshot': percentage}
        # Validate line before SQL CHECK, including raw gross vs line discount.
        sale_totals([fields], ZERO, ZERO)
        old_price = obj.precio_unitario if obj else catalog_price
        if obj is None:
            obj = m.DetallesVenta.objects.create(venta_id=sale.pk, **fields)
        else:
            for field, value in fields.items():
                setattr(obj, field, value)
            obj.save(update_fields=list(fields))
        if 'precio_unitario' in data:
            record(actor, obj, 'PRECIO_EXCEPCION', {'anterior': str(old_price), 'nuevo': str(price), 'motivo': data['motivo_precio']})
        kept.append(obj.pk)
    m.DetallesVenta.objects.filter(venta_id=sale.pk).exclude(pk__in=kept).delete()


def create_sale_draft(data, actor):
    visit = None
    client_id = data.get('clienta_id')
    if data.get('visita_id'):
        visit = get_object_or_404(m.Visitas.objects.select_for_update(), pk=data['visita_id'])
        if visit.estado != 'ABIERTA':
            raise FinanceError('visita_incompatible', 'La visita debe estar abierta.')
        if client_id is not None and client_id != visit.clienta_id:
            raise FinanceError('clienta_incompatible', 'La venta debe corresponder a la clienta de la visita.')
        client_id = visit.clienta_id
        if m.Ventas.objects.filter(visita_id=visit.pk).exists():
            raise FinanceError('venta_existente', 'La visita ya tiene una venta.')
    if client_id is not None:
        client = get_object_or_404(m.Clientas, pk=client_id)
        if not client.activa:
            raise FinanceError('clienta_inactiva', 'La ficha esta inactiva.')
    appointment = None
    appointment_prices = None
    incoming = data.get('lineas', [])
    if data.get('cita_id'):
        if visit is None:
            raise FinanceError('cita_sin_visita', 'La cita requiere una visita.', 'invalid')
        from . import appointment_checkout
        appointment = appointment_checkout.lock_for_sale(visit, data['cita_id'])
        if appointment.visita_id is None:
            from .visits import link_appointment
            link_appointment(visit, appointment.pk, actor)
        appointment_prices = dict(m.CitaServicios.objects.filter(cita_id=appointment.pk).values_list('servicio_id', 'precio_snapshot'))
        if 'lineas' not in data:
            incoming = appointment_checkout.lines(appointment)
            if not incoming:
                raise FinanceError('cita_sin_servicios', 'La cita no tiene tratamientos registrados.', 'invalid')
    sale = m.Ventas.objects.create(visita_id=visit.pk if visit else None, clienta_id=client_id, creada_por_id=actor.pk)
    sale.descuento_global, sale.propina = data.get('descuento_global', ZERO), data.get('propina', ZERO)
    update_lines(sale, incoming, actor, appointment_prices=appointment_prices)
    recalculate(sale)
    record(actor, sale, 'CREAR_VENTA', {'numero_lineas': m.DetallesVenta.objects.filter(venta_id=sale.pk).count()})
    return selectors.balance_summary(sale)


def update_sale_draft(pk, data, actor):
    sale = lock_sale(pk, draft=True)
    validate_visit(sale)
    clean_draft_sources(sale)
    for field in ('descuento_global', 'propina'):
        if field in data:
            setattr(sale, field, data[field])
    if 'lineas' in data:
        update_lines(sale, data['lineas'], actor)
    recalculate(sale)
    record(actor, sale, 'EDITAR_VENTA', {'campos': sorted(data)})
    return selectors.balance_summary(sale)


def consumption_plan(lines, groups, required):
    service_ids = {row.pk for row in lines if row.tipo == 'SERVICIO'}
    if groups is None:
        if required and service_ids:
            raise FinanceError('consumos_reales_requeridos', 'Declara los consumos reales de cada servicio, incluso una lista vacia.', 'invalid')
        return []
    seen, entries = set(), []
    for group in groups:
        detail_id = group['detalle_id']
        if detail_id in seen or detail_id not in service_ids:
            raise FinanceError('consumo_invalido', 'Detalle repetido, ajeno o no correspondiente a servicio.', 'invalid')
        seen.add(detail_id)
        articles = set()
        for row in group['insumos']:
            if row['articulo_id'] in articles:
                raise FinanceError('consumo_invalido', 'No repitas insumos por servicio.', 'invalid')
            articles.add(row['articulo_id'])
            entries.append(ActualConsumption(detail_id, row['articulo_id'], row['unidad_id'], row['cantidad']))
            if len(entries) > 300:
                raise FinanceError('consumos_excesivos', 'Maximo 300 consumos reales por confirmacion.', 'invalid')
    if required and seen != service_ids:
        raise FinanceError('consumos_reales_requeridos', 'Falta revisar un servicio.', 'invalid')
    return entries


def preview_sale(pk, data):
    sale = selectors.get_sale(pk)
    if sale.estado != 'BORRADOR':
        raise FinanceError('estado_venta', 'La previsualizacion editable requiere BORRADOR.')
    lines = list(sale.detallesventa_set.all())
    computed = totals(sale)
    suggestions = []
    for line in lines:
        if line.tipo == 'SERVICIO':
            recipe = m.RecetasServicio.objects.filter(servicio_id=line.servicio_id).select_related('articulo__unidad').order_by('id')
            suggestions.append({'detalle_id': line.pk, 'insumos': [{'articulo_id': row.articulo_id,
                'unidad_id': row.articulo.unidad_id, 'cantidad': quantize(row.cantidad_estimada * line.cantidad, 3)}
                for row in recipe]})
    entries = consumption_plan(lines, data.get('consumos_reales'), required=data.get('consumos_reales') is not None)
    if data.get('consumos_reales') is None:
        entries = consumption_plan(lines, suggestions, required=False)
    needs = {}
    for line in lines:
        if line.tipo == 'PRODUCTO':
            needs[line.articulo_id] = needs.get(line.articulo_id, ZERO) + line.cantidad
    for entry in entries:
        item = get_object_or_404(m.Articulos, pk=entry.article_id)
        inventory.require_unit(item, entry.unit_id)
        if item.tipo not in ('INSUMO', 'AMBOS'):
            raise FinanceError('consumo_invalido', 'Un producto de venta puro no es insumo.', 'invalid')
        needs[entry.article_id] = needs.get(entry.article_id, ZERO) + entry.quantity
    resources, direct, known = [], ZERO, True
    for pk, needed in sorted(needs.items()):
        cost = inventory.acquisition_cost_snapshot(pk)
        available = inventory.balance(pk)
        if cost is None:
            known = False
        else:
            with localcontext() as ctx:
                ctx.prec = 48
                direct += needed * cost
        resources.append({'articulo_id': pk, 'cantidad_requerida': needed, 'existencia_actual': available,
                          'costo_unitario_estimado': cost, 'suficiente': available >= needed})
    return {'venta_id': sale.pk, **{key: computed[key] for key in ('subtotal','descuento_global','propina','total')},
            'receta_sugerida': suggestions, 'stock_consultado': resources,
            'costo_directo_estimado': quantize(direct) if known else None, 'politica_costo': COST_POLICY,
            'origen_consumos': 'RECETA_ESTIMADA' if data.get('consumos_reales') is None else 'REAL_PROPUESTO',
            'afecta_stock': False, 'moneda': 'PEN'}


def confirm_sale(pk, data, actor):
    sale = lock_sale(pk, draft=True)
    visit = validate_visit(sale)
    if data['consumos_revisados'] is not True:
        raise FinanceError('consumos_reales_requeridos', 'Confirma la revision de consumos reales.', 'invalid')
    lines = list(m.DetallesVenta.objects.select_for_update().filter(venta_id=pk).order_by('id'))
    if not lines:
        raise FinanceError('venta_vacia', 'No se confirma una venta sin lineas.', 'invalid')
    clean_draft_sources(sale)
    for line in lines:
        item = get_object_or_404(m.Servicios if line.tipo == 'SERVICIO' else m.Articulos,
                                 pk=line.servicio_id if line.tipo == 'SERVICIO' else line.articulo_id)
        if not item.activo:
            raise FinanceError('item_inactivo', 'Un item fue desactivado.')
        if line.profesional_id and not m.Profesionales.objects.filter(pk=line.profesional_id, activa=True).exists():
            raise FinanceError('profesional_inactivo', 'El profesional no esta activo.')
    entries = consumption_plan(lines, data.get('consumos_reales'), required=True)
    recalculate(sale)
    inventory.issue_sale_stock(sale, [line for line in lines if line.tipo == 'PRODUCTO'], entries, actor)
    sale.estado, sale.confirmada_en = 'CONFIRMADA', timezone.now()
    sale.save(update_fields=['estado', 'confirmada_en'])
    if visit:
        visit.estado, visit.fin_en = 'FINALIZADA', timezone.now()
        visit.save(update_fields=['estado', 'fin_en'])
        record(actor, visit, 'FINALIZAR_VISITA', {'venta_id': sale.pk})
    record(actor, sale, 'CONFIRMAR_VENTA', {'politica_costo': COST_POLICY, 'numero_lineas': len(lines)})
    return selectors.balance_summary(sale)


def cancel_sale(pk, data, actor):
    sale = lock_sale(pk)
    if sale.estado == 'CONFIRMADA':
        raise FinanceError('compensacion_requerida', 'Una venta confirmada requiere devolucion y compensacion trazables; no se anula como borrador.')
    if sale.estado != 'BORRADOR':
        raise FinanceError('estado_venta', 'Solo se anulan ventas BORRADOR.')
    if m.Pagos.objects.filter(venta_id=pk).exists() or m.AnticiposCita.objects.filter(venta_id=pk).exists():
        raise FinanceError('fuentes_financieras', 'La venta requiere conciliacion antes de anular.')
    clean_draft_sources(sale)
    sale.estado = 'ANULADA'
    sale.save(update_fields=['estado'])
    record(actor, sale, 'ANULAR_VENTA', {'motivo': data['motivo']})
    return selectors.balance_summary(sale)

