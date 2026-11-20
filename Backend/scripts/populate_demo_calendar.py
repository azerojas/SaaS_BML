"""Fill the local demo calendar through booking rules; rehearsal unless --apply."""
import argparse
from collections import Counter
from datetime import datetime, time, timedelta
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from django.contrib.auth import get_user_model
from django.db import connection, transaction
from django.utils import timezone
from django.test import override_settings
from negocio import models as m
from apps.agenda.application import bookings, daily_schedule
from apps.agenda.domain.commands import BookingCommand
from apps.agenda.domain.rules import ACTIVE, ZONE
from apps.agenda.infrastructure import repositories as repo
from apps.agenda.infrastructure.transactions import agenda_transaction
from apps.agenda.models import DailySchedule


@override_settings(AGENDA_BOOKING_SLOT_MINUTES=60)
def populate(apply=False):
    if connection.settings_dict['NAME'].casefold() != 'lasheo' or connection.settings_dict['HOST'] not in ('localhost', '127.0.0.1'):
        raise RuntimeError('Only the local Lasheo demo database is supported.')
    now = timezone.now().astimezone(ZONE)
    today = now.date()
    marker = 'DEMO-CALENDARIO-' + today.strftime('%Y%m%d')
    actor = get_user_model().objects.get(username='operador_local', is_staff=True, is_active=True)
    professionals = list(m.Profesionales.objects.filter(apellidos='Demo', activa=True).select_related('usuario').order_by('id'))
    clients = list(m.Clientas.objects.filter(apellidos='Demo', email__endswith='@example.test', activa=True).order_by('id'))
    services = list(m.Servicios.objects.filter(slug__startswith='demo-', activo=True, requiere_anticipo=False).order_by('id'))
    if len(professionals) != 3 or len(clients) < 12 or not services:
        raise RuntimeError('The existing labelled demo professionals, clients and catalog are required.')

    with agenda_transaction():
        previous = m.Auditoria.objects.filter(entidad='DEMO_CALENDARIO', entidad_id=marker, accion='CARGAR_DEMO').first()
        if previous:
            return {'already_loaded': True, **previous.datos}
        states_before = dict(m.Citas.objects.values_list('id', 'estado'))
        financial_before = (m.Ventas.objects.count(), m.Pagos.objects.count(), m.AnticiposCita.objects.count(), m.MovimientosInventario.objects.count())
        config = repo.config()
        created, schedules, skipped = [], [], []
        client_index = 0
        for offset in range(7):
            day = today + timedelta(days=offset)
            selected_hours = [18] if offset == 0 else [10, 14, 16] if offset == 1 else [10, 14] if offset == 2 else [14 if offset % 2 else 16]
            for professional in professionals:
                if not DailySchedule.objects.filter(fecha=day, profesional_id=professional.pk).exists():
                    daily_schedule.save({'fecha': day, 'profesional_id': professional.pk, 'franjas': [
                        * [{'inicio': time(hour), 'fin': time(hour + 1), 'cupo_unico': True} for hour in [10, 11, 12, 14, 15, 16, 17, 18, 19]],
                    ]}, professional.usuario or actor)
                    schedules.append({'date': str(day), 'professional_id': professional.pk})
                for hour in selected_hours:
                    start = datetime.combine(day, time(hour), ZONE)
                    if start < now + timedelta(minutes=config.anticipacion_minima_minutos):
                        skipped.append({'date': str(day), 'hour': hour, 'reason': 'outside_minimum_notice'})
                        continue
                    compatible = [service for service in services if m.ProfesionalServicios.objects.filter(profesional_id=professional.pk, servicio_id=service.pk).exists()]
                    if not compatible:
                        raise RuntimeError('A demo professional has no compatible treatment.')
                    service = compatible[len(created) % len(compatible)]
                    end = start + timedelta(hours=1)
                    client = None
                    for step in range(len(clients)):
                        candidate = clients[(client_index + step) % len(clients)]
                        if m.Citas.objects.filter(clienta_id=candidate.pk, estado__in=ACTIVE, fin_en__gt=now).count() >= config.max_citas_activas_por_clienta:
                            continue
                        if repo.collision(professional.pk, start, end, candidate.pk):
                            continue
                        client = candidate
                        client_index = (client_index + step + 1) % len(clients)
                        break
                    if client is None:
                        skipped.append({'date': str(day), 'professional_id': professional.pk, 'hour': hour, 'reason': 'occupied'})
                        continue
                    result = bookings.create(BookingCommand(client.pk, professional.pk, (service.pk,), start, notas=marker + '. Cita ficticia para visualizar una reserva.'), actor)
                    if result['estado'] != 'PROGRAMADA':
                        raise RuntimeError('Demo appointments must not require payments.')
                    if len(created) % 2 == 0:
                        result = bookings.resolve(result['cita_id'], 'confirmar', {}, actor)
                    created.append({'id': result['cita_id'], 'date': str(day), 'start': start.isoformat(), 'professional_id': professional.pk, 'client_id': client.pk, 'service': service.nombre, 'state': result['estado']})
        if dict(m.Citas.objects.filter(pk__in=states_before).values_list('id', 'estado')) != states_before:
            raise RuntimeError('An existing appointment changed; the whole rehearsal is rolled back.')
        financial_after = (m.Ventas.objects.count(), m.Pagos.objects.count(), m.AnticiposCita.objects.count(), m.MovimientosInventario.objects.count())
        if financial_after != financial_before:
            raise RuntimeError('Financial or inventory changes are not allowed by this demo.')
        report = {'marker': marker, 'from': str(today), 'to': str(today + timedelta(days=6)), 'count': len(created), 'states': dict(Counter(row['state'] for row in created)), 'appointments': created, 'published_days': len(schedules), 'skipped': skipped, 'financial_records_unchanged': True}
        m.Auditoria.objects.create(usuario=actor, entidad='DEMO_CALENDARIO', entidad_id=marker, accion='CARGAR_DEMO', datos=report, creada_en=timezone.now())
        if not apply:
            transaction.set_rollback(True)
        return {'applied': apply, **report}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    print(json.dumps(populate(parser.parse_args().apply), ensure_ascii=False, indent=2))
