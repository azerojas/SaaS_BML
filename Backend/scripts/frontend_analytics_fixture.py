"""Synthetic analytics fixture; callable only against the temporary browser acceptance database."""
from datetime import date, datetime, timedelta
from decimal import Decimal as D
from uuid import uuid4
from django.db import connection, transaction
from django.utils import timezone
from negocio import models as m
from apps.finanzas.application import visits, sales, payments, advances, cash_ledger
from apps.finanzas.infrastructure.idempotency import execute
from apps.finanzas.models import Refund
from apps.inventario import services as inventory
from apps.reporting.domain.periods import ZONE


def seed(actor, unit):
    assert connection.settings_dict['NAME'].startswith('frontend_e2e_')
    def command(operation, target, data, callback):
        return execute(operation, str(uuid4()), {'target': target, 'data': data}, actor, lambda key: (callback(key), 201))[0]
    stamp = datetime(2026, 10, 15, 12, tzinfo=ZONE)
    prior = datetime(2026, 9, 30, 12, tzinfo=ZONE)
    with transaction.atomic():
        client = m.Clientas.objects.create(nombres='=Clienta analitica F5', apellidos='Ficticia', telefono='+51955123555', activa=True, acepta_recordatorios=False, canal_preferido='EMAIL')
        professional = m.Profesionales.objects.create(nombres='Profesional F5', apellidos='Ficticia', comision_porcentaje=D('10.00'))
        service = m.Servicios.objects.create(nombre='=Tratamiento analitica F5', precio_base=D('80.00'), activo=True)
        product = m.Articulos.objects.create(nombre='Producto analitica F5', tipo='VENTA', unidad=unit, precio_venta=D('20.00'), activo=True)
        material = m.Articulos.objects.create(nombre='Insumo bajo F5', tipo='INSUMO', unidad=unit, stock_minimo=D('20.000'), activo=True)
        purchase = inventory.save_purchase({'detalles': [{'articulo_id': item.pk, 'unidad_id': unit.pk, 'cantidad': D('10.000'), 'costo_unitario': cost} for item, cost in [(product, D('4.0000')), (material, D('2.0000'))]]}, actor)
        inventory.receive_purchase(purchase.pk, actor)
        visit_data = {'clienta_id': client.pk}
        visit = command('visita.abrir', None, visit_data, lambda key: visits.open_visit(visit_data, actor))['visita_id']
        appointment = m.Citas.objects.create(clienta=client, profesional=professional, visita_id=visit, inicio_en=stamp, fin_en=stamp+timedelta(minutes=30), precio_total=D('100.00'))
        advance_data = {'cita_id': appointment.pk, 'metodo': 'EFECTIVO', 'monto': D('30.00')}
        advance = command('anticipo.crear', None, advance_data, lambda key: advances.create_advance(advance_data, actor))['anticipo_id']
        command('anticipo.confirmar', advance, {'verificado_manualmente': True}, lambda key: advances.confirm_advance(advance, {'verificado_manualmente': True}, actor))
        m.AnticiposCita.objects.filter(pk=advance).update(pagado_en=prior)
        draft_data = {'visita_id': visit, 'descuento_global': D('10.00'), 'propina': D('5.00'), 'lineas': [
            {'tipo': 'SERVICIO', 'servicio_id': service.pk, 'profesional_id': professional.pk, 'cantidad': D('1.000')},
            {'tipo': 'PRODUCTO', 'articulo_id': product.pk, 'unidad_id': unit.pk, 'cantidad': D('1.000')}]}
        sale = command('venta.crear', None, draft_data, lambda key: sales.create_sale_draft(draft_data, actor))['venta_id']
        line = m.DetallesVenta.objects.get(venta_id=sale, tipo='SERVICIO')
        confirm_data = {'consumos_revisados': True, 'consumos_reales': [{'detalle_id': line.pk, 'insumos': [{'articulo_id': material.pk, 'unidad_id': unit.pk, 'cantidad': D('0.500')}]}]}
        command('venta.confirmar', sale, confirm_data, lambda key: sales.confirm_sale(sale, confirm_data, actor))
        m.Ventas.objects.filter(pk=sale).update(confirmada_en=stamp)
        m.Visitas.objects.filter(pk=visit).update(inicio_en=stamp, fin_en=stamp+timedelta(minutes=30))
        apply_data = {'anticipo_id': advance, 'monto': D('30.00')}
        command('anticipo.aplicar', sale, apply_data, lambda key: advances.apply_advance(sale, apply_data, actor, key))
        payment_data = {'metodo': 'YAPE', 'monto': D('20.00'), 'referencia': 'F5-ANALYTICS-REAL', 'verificado_manualmente': True}
        payment = command('pago.registrar', sale, payment_data, lambda key: payments.register_payment(sale, payment_data, actor))['pago_id']
        m.Pagos.objects.filter(pk=payment).update(pagado_en=stamp)
        wrong_data = {'metodo': 'EFECTIVO', 'monto': D('5.00'), 'verificado_manualmente': True}
        wrong = command('pago.registrar', sale, wrong_data, lambda key: payments.register_payment(sale, wrong_data, actor))['pago_id']
        m.Pagos.objects.filter(pk=wrong).update(pagado_en=stamp)
        void_data = {'motivo': 'Error sintetico de prueba', 'error_registro_confirmado': True}
        command('pago.anular', wrong, void_data, lambda key: payments.void_payment(wrong, void_data, actor))
        refund_data = {'pago_id': payment, 'monto': D('3.00'), 'metodo': 'EFECTIVO', 'motivo': 'Devolucion sintetica verificada', 'devolucion_verificada': True}
        refund = command('reembolso.registrar', None, refund_data, lambda key: cash_ledger.refund(refund_data, actor, key))['reembolso_id']
        Refund.objects.filter(pk=refund).update(creada_en=stamp)
        adjustment = {'monto': D('2.00'), 'motivo': 'Ajuste comercial sintetico'}
        command('venta.ajustar', sale, adjustment, lambda key: cash_ledger.adjust(sale, adjustment, actor, key))
        for cancelled in [False, True]:
            data = {'lineas': [{'tipo': 'PRODUCTO', 'articulo_id': product.pk, 'unidad_id': unit.pk, 'cantidad': D('1.000')}]}
            other = command('venta.crear', None, data, lambda key: sales.create_sale_draft(data, actor))['venta_id']
            if cancelled:
                reason = {'motivo': 'Borrador sintetico duplicado'}
                command('venta.anular', other, reason, lambda key: sales.cancel_sale(other, reason, actor))
        category = m.CategoriasGasto.objects.create(nombre='@Gasto analitica F5')
        m.GastosOperativos.objects.create(categoria=category, descripcion='Gasto ficticio de pruebas', monto=D('7.00'), fecha=stamp.date(), creado_en=stamp, registrado_por=actor)
        # All six payment methods, including zero-source days, require an evidenced closure.
        from apps.finanzas.presentation.serializers import METHODS
        day = date(2026, 10, 1)
        while day < date(2026, 11, 1):
            for method in METHODS:
                close = {'fecha': day, 'metodo': method, 'observado': cash_ledger.daily_snapshot(day, method)['neto'], 'evidencia_sha256': 'a'*64, 'referencia': 'SYNTHETIC-F5-CLOSURE'}
                command('caja.conciliar', None, close, lambda key: cash_ledger.reconcile(close, actor, key))
            day += timedelta(days=1)
    return {'sale': sale, 'client': client.pk, 'service': service.pk, 'material': material.pk, 'payment': payment, 'advance': advance, 'desde': '2026-10-01', 'hasta': '2026-10-31', 'synthetic_only': True}
