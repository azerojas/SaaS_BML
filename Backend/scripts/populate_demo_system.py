"""Populate the local Lasheo database with labelled, repeatable demonstration data.

Run with --apply to commit; the default is a complete transactional rehearsal.
Existing catalog records and operator credentials are preserved.
"""
import argparse
from datetime import date, datetime, time, timedelta
from decimal import Decimal as D
import json
import os
from pathlib import Path
import sys
from unittest.mock import patch
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from django.contrib.auth import get_user_model
from django.db import connection, transaction
from django.utils import timezone
from negocio import models as m
from apps.agenda.application import administration, bookings, daily_schedule
from apps.agenda.models import DailySchedule
from apps.agenda.domain.commands import BookingCommand
from apps.agenda.domain.rules import ZONE
from apps.finanzas.application import visits, sales, payments, advances
from apps.finanzas.infrastructure.idempotency import execute
from apps.inventario import services as inventory
from apps.reporting.application import services as reporting
from apps.reporting.domain.periods import ReportFilter

MARKER = 'DEMO-SISTEMA-20261119'
TODAY = date(2026, 11, 19)


def ensure_demo_schedules(actor):
    dates = []
    for offset in range(7):
        day = TODAY + timedelta(days=offset)
        if not DailySchedule.objects.filter(fecha=day, profesional_id__isnull=True).exists() and day >= timezone.now().astimezone(ZONE).date():
            daily_schedule.save({'fecha': day, 'profesional_id': None, 'franjas': [{'inicio': time(9), 'fin': time(19)}]}, actor)
        dates.append(str(day))
    return dates


def populate(commit=False):
    if connection.settings_dict['NAME'].casefold() != 'lasheo' or connection.settings_dict['HOST'] not in ('127.0.0.1', 'localhost'):
        raise RuntimeError('Only the existing local Lasheo database is supported.')
    actor = get_user_model().objects.get(username='operador_local', is_active=True, is_staff=True)

    def command(operation, target, data, callback):
        return execute(operation, str(uuid4()), {'target': target, 'data': data}, actor, lambda key: (callback(key), 201))[0]

    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute('SELECT pg_advisory_xact_lock(718302453)')
        previous = m.Auditoria.objects.filter(entidad='DEMO_SISTEMA', entidad_id=MARKER, accion='CARGAR_DEMO').first()
        if previous:
            dates = ensure_demo_schedules(actor)
            if not commit:
                transaction.set_rollback(True)
            return {'already_loaded': True, **previous.datos, 'daily_schedule_dates': dates}
        if m.Clientas.objects.filter(notas_privadas__startswith=MARKER).exists():
            raise RuntimeError('Existing demonstration records require review; nothing was overwritten.')
        services = list(m.Servicios.objects.filter(slug__startswith='demo-', activo=True).order_by('id'))
        products = list(m.Articulos.objects.filter(slug__startswith='demo-', tipo='VENTA', activo=True).order_by('id'))
        if len(services) < 6 or len(products) < 4:
            raise RuntimeError('The original local demo catalog is required first.')
        unit = m.UnidadesMedida.objects.get(codigo='ud')
        clients = []
        for index, name in enumerate(['Valeria', 'Camila', 'Luciana', 'Daniela', 'Mariana', 'Sofia', 'Isabella', 'Antonella', 'Gabriela', 'Fernanda', 'Paula', 'Renata', 'Adriana', 'Andrea', 'Natalia', 'Carolina', 'Ariana', 'Victoria', 'Alessandra', 'Jimena', 'Rocio', 'Claudia', 'Elena', 'Milagros']):
            clients.append(m.Clientas.objects.create(nombres=name, apellidos='Demo', telefono=f'+51{900050000 + index}', email=f'demo.clienta{index+1:02d}@example.test', fecha_nacimiento=date(1990 + index % 12, index % 12 + 1, index % 25 + 1), notas_privadas=f'{MARKER}. Persona ficticia para explorar el sistema.', consentimiento_datos=False, acepta_recordatorios=False, canal_preferido='EMAIL', activa=True))

        professionals = []
        for index, name in enumerate(['Ana', 'Maria', 'Lucia']):
            result = administration.professional({'nombres': name, 'apellidos': 'Demo', 'comision_porcentaje': D(['10', '12', '15'][index]), 'activa': True, 'visible_reservas': True}, actor)
            professional = m.Profesionales.objects.get(pk=result['profesional_id'])
            professionals.append(professional)
            administration.specialties(professional.pk, [row.pk for row in services], actor)
            for weekday in range(1, 8):
                administration.schedule({'profesional_id': professional.pk, 'dia_semana': weekday, 'hora_inicio': time(9), 'hora_fin': time(19)}, actor)

        providers = [inventory.save_provider({'nombre': 'Demo - ' + name, 'email': f'demo.proveedor{index}@example.test', 'activo': True}, actor) for index, name in enumerate(['Lash Supplies', 'Belleza Integral', 'Accesorios del Salon'], 1)]
        category, _ = m.CategoriasArticulo.objects.get_or_create(nombre='Demo - Insumos de cabina')
        materials = []
        for slug, name, minimum in [('adhesivo-cabina', 'Adhesivo de cabina', '20'), ('parches-cabina', 'Parches de cabina', '15'), ('microcepillos-bajo', 'Microcepillos - stock bajo', '10'), ('guantes-agotados', 'Guantes - agotados', '5')]:
            materials.append(m.Articulos.objects.create(nombre='Demo - ' + name, slug='demo-' + slug, descripcion=MARKER + '. Insumo ficticio.', sku='DEMO-' + slug.upper(), categoria=category, unidad=unit, tipo='INSUMO', precio_venta=D('0'), stock_minimo=D(minimum), visible_catalogo=False, activo=True))
        for service in services:
            m.RecetasServicio.objects.create(servicio=service, articulo=materials[0], cantidad_estimada=D('1.000'))
            m.RecetasServicio.objects.create(servicio=service, articulo=materials[1], cantidad_estimada=D('1.000'))

        purchases = []
        rows = [{'articulo_id': row.pk, 'unidad_id': row.unidad_id, 'cantidad': D('40.000'), 'costo_unitario': D(str(5 + index * 3))} for index, row in enumerate(products)]
        rows += [{'articulo_id': row.pk, 'unidad_id': row.unidad_id, 'cantidad': D(quantity), 'costo_unitario': D(cost)} for row, quantity, cost in [(materials[0], '120.000', '2.0000'), (materials[1], '120.000', '1.0000'), (materials[2], '3.000', '0.5000')]]
        first = inventory.save_purchase({'proveedor_id': providers[0].pk, 'numero_documento': MARKER + '-001', 'observaciones': 'Compra ficticia inicial de demostracion.', 'detalles': rows}, actor)
        inventory.receive_purchase(first.pk, actor)
        purchases.append(first.pk)
        second = inventory.save_purchase({'proveedor_id': providers[1].pk, 'numero_documento': MARKER + '-002', 'observaciones': 'Reposicion ficticia de demostracion.', 'detalles': [{'articulo_id': products[0].pk, 'unidad_id': unit.pk, 'cantidad': D('10.000'), 'costo_unitario': D('6.0000')}]}, actor)
        inventory.receive_purchase(second.pk, actor)
        purchases.append(second.pk)
        draft = inventory.save_purchase({'proveedor_id': providers[2].pk, 'numero_documento': MARKER + '-003', 'observaciones': 'Borrador ficticio: puedes practicar la recepcion.', 'detalles': [{'articulo_id': materials[3].pk, 'unidad_id': unit.pk, 'cantidad': D('50.000'), 'costo_unitario': D('0.5000')}]}, actor)
        purchases.append(draft.pk)

        sale_ids, appointment_ids, payment_ids = [], [], []
        methods = ['EFECTIVO', 'YAPE', 'PLIN', 'TRANSFERENCIA', 'TARJETA']
        for index in range(30):
            day = date(2026, 11, index % 18 + 1) if index < 24 else date(2026, 10, index - 23)
            hour = 10 if index < 18 or index >= 24 else 14
            stamp = datetime.combine(day, time(hour), ZONE)
            service, client, professional = services[index % 6], clients[index % 24], professionals[index % 3]
            # Rehearse the same booking/attention workflow at the demonstration date.
            with patch('django.utils.timezone.now', return_value=stamp - timedelta(days=1)):
                ap = bookings.create(BookingCommand(client.pk, professional.pk, (service.pk,), stamp, notas=MARKER), actor)
            appointment_ids.append(ap['cita_id'])
            with patch('django.utils.timezone.now', return_value=stamp):
                visit_data = {'clienta_id': client.pk, 'cita_id': ap['cita_id'], 'notas': MARKER + '. Atencion ficticia finalizada.'}
                visit = command('visita.abrir', None, visit_data, lambda key: visits.open_visit(visit_data, actor))['visita_id']
                m.Visitas.objects.filter(pk=visit).update(inicio_en=stamp)
                lines = [{'tipo': 'SERVICIO', 'servicio_id': service.pk, 'profesional_id': professional.pk, 'cantidad': D('1.000')}]
                if index % 2 == 0:
                    product = products[index % 4]
                    lines.append({'tipo': 'PRODUCTO', 'articulo_id': product.pk, 'unidad_id': product.unidad_id, 'cantidad': D('1.000')})
                draft_data = {'visita_id': visit, 'propina': D('5.00') if index % 3 == 0 else D('0.00'), 'descuento_global': D('5.00') if index % 4 == 0 else D('0.00'), 'lineas': lines}
                sale = command('venta.crear', None, draft_data, lambda key: sales.create_sale_draft(draft_data, actor))['venta_id']
                m.Ventas.objects.filter(pk=sale).update(creada_en=stamp)
                line = m.DetallesVenta.objects.get(venta_id=sale, tipo='SERVICIO')
                data = {'consumos_revisados': True, 'consumos_reales': [{'detalle_id': line.pk, 'insumos': [{'articulo_id': item.pk, 'unidad_id': unit.pk, 'cantidad': D('1.000')} for item in materials[:2]]}]}
                summary = command('venta.confirmar', sale, data, lambda key: sales.confirm_sale(sale, data, actor))
                if index % 7 != 0:
                    amount = D(summary['saldo_pendiente'])
                    if index % 5 == 0:
                        amount = (amount * D('0.5')).quantize(D('0.01'))
                    payment = {'metodo': methods[index % 5], 'monto': amount, 'referencia': f'DEMO-20261119-{index:03d}', 'verificado_manualmente': True}
                    result = command('pago.registrar', sale, payment, lambda key: payments.register_payment(sale, payment, actor))
                    m.Pagos.objects.filter(pk=result['pago_id']).update(pagado_en=stamp)
                    payment_ids.append(result['pago_id'])
                bookings.resolve(ap['cita_id'], 'completar', {}, actor)
                m.Citas.objects.filter(pk=ap['cita_id']).update(creada_en=stamp - timedelta(days=1))
                sale_ids.append(sale)

        upcoming, advance_ids = [], []
        for index in range(18):
            day = TODAY + timedelta(days=index // 6)
            stamp = datetime.combine(day, time(10 if index % 6 < 3 else 14), ZONE)
            data = bookings.create(BookingCommand(clients[index].pk, professionals[index % 3].pk, (services[index % 6].pk,), stamp, notas=MARKER + '. Cita ficticia para explorar el calendario.'), actor)
            if index % 2 == 0:
                bookings.resolve(data['cita_id'], 'confirmar', {}, actor)
            if index < 5:
                advance = {'cita_id': data['cita_id'], 'metodo': methods[index], 'monto': min(D('20.00'), data['precio_total']), 'referencia': f'DEMO-ANTICIPO-{index:03d}'}
                pk = command('anticipo.crear', None, advance, lambda key: advances.create_advance(advance, actor))['anticipo_id']
                command('anticipo.confirmar', pk, {'verificado_manualmente': True}, lambda key: advances.confirm_advance(pk, {'verificado_manualmente': True}, actor))
                advance_ids.append(pk)
            upcoming.append(data['cita_id'])

        open_visits = []
        for client in clients[20:23]:
            data = {'clienta_id': client.pk, 'notas': MARKER + '. Atencion abierta para practicar.'}
            visit = command('visita.abrir', None, data, lambda key: visits.open_visit(data, actor))['visita_id']
            open_visits.append(visit)
        draft_sale = command('venta.crear', None, {'visita_id': open_visits[0]}, lambda key: sales.create_sale_draft({'visita_id': open_visits[0], 'lineas': [{'tipo': 'SERVICIO', 'servicio_id': services[2].pk, 'profesional_id': professionals[0].pk, 'cantidad': D('1.000')}]}, actor))['venta_id']
        categories = [m.CategoriasGasto.objects.create(nombre='Demo - ' + name) for name in ['Servicios del salon', 'Limpieza', 'Publicidad']]
        for index, amount in enumerate(['65', '30', '45', '80', '25', '35', '60', '20', '40']):
            m.GastosOperativos.objects.create(categoria=categories[index % 3], descripcion=f'{MARKER}. Gasto ficticio {index+1}', monto=D(amount), fecha=date(2026, 11, index * 2 + 1), registrado_por=actor, creado_en=datetime(2026, 11, index * 2 + 1, 10, tzinfo=ZONE))
        point = m.PuntosQr.objects.create(nombre='Demo - Recepcion del salon', activo=True)
        schedule_dates = ensure_demo_schedules(actor)

        filters = ReportFilter(date(2026, 11, 1), date(2026, 12, 1))
        overview = reporting.overview(filters)
        report = {
            'marker': MARKER, 'demo_date': str(TODAY), 'clients': [row.pk for row in clients], 'professionals': [row.pk for row in professionals],
            'confirmed_sales': sale_ids, 'draft_sale': draft_sale, 'completed_appointments': appointment_ids, 'upcoming_appointments': upcoming,
            'open_visits': open_visits, 'purchases': purchases, 'providers': [row.pk for row in providers], 'materials': [row.pk for row in materials],
            'payments': payment_ids, 'advances': advance_ids, 'expenses': 9, 'qr_point': point.pk,
            'november_indicators': overview['indicadores'], 'committed': commit, 'daily_schedule_dates': schedule_dates,
        }
        m.Auditoria.objects.create(usuario=actor, entidad='DEMO_SISTEMA', entidad_id=MARKER, accion='CARGAR_DEMO', datos=json.loads(json.dumps(report, default=str)), creada_en=timezone.now())
        if not commit:
            transaction.set_rollback(True)
        return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    arguments = parser.parse_args()
    print(json.dumps(populate(arguments.apply), ensure_ascii=False, default=str, indent=2))
