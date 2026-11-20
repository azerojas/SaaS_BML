"""Correct only labelled demo bookings to independent one-hour slots; --apply commits."""
import argparse
from datetime import datetime, time, timedelta
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from django.contrib.auth import get_user_model
from django.db import connection, transaction
from django.test import override_settings
from django.utils import timezone
from apps.agenda.application import daily_schedule
from apps.agenda.infrastructure import repositories as repo
from apps.agenda.infrastructure.transactions import agenda_transaction
from apps.agenda.models import DailySchedule
from apps.agenda.domain.rules import ZONE
from apps.finanzas.application.audit import record
from negocio import models as m


@override_settings(AGENDA_BOOKING_SLOT_MINUTES=60)
def repair(marker, apply=False):
    if connection.settings_dict['NAME'].casefold() != 'lasheo' or connection.settings_dict['HOST'] not in ('localhost','127.0.0.1'):
        raise RuntimeError('Only the local Lasheo demo database is supported.')
    first=datetime.strptime(marker,'DEMO-CALENDARIO-%Y%m%d').date()
    actor=get_user_model().objects.get(username='operador_local',is_active=True,is_staff=True)
    with agenda_transaction():
        if not m.Auditoria.objects.filter(entidad='DEMO_CALENDARIO',entidad_id=marker,accion='CARGAR_DEMO').exists():
            raise RuntimeError('An audited demo load is required.')
        rows=list(m.Citas.objects.select_for_update().filter(notas__startswith=marker).order_by('id'))
        if not rows:
            raise RuntimeError('No demo bookings found.')
        finances=lambda: (m.Ventas.objects.count(),m.Pagos.objects.count(),m.AnticiposCita.objects.count(),m.MovimientosInventario.objects.count())
        before=finances()
        changed=0
        professional_ids=set()
        for row in rows:
            if row.visita_id or row.profesional.apellidos!='Demo' or row.clienta.apellidos!='Demo' or not row.clienta.email.endswith('@example.test'):
                raise RuntimeError('Only unattended, explicitly labelled demo bookings may change.')
            end=row.inicio_en+timedelta(hours=1)
            if repo.collision(row.profesional_id,row.inicio_en,end,row.clienta_id,exclude=row.pk):
                raise RuntimeError('The corrected slot would overlap another reservation.')
            professional_ids.add(row.profesional_id)
            if row.fin_en!=end or row.duracion_total_minutos!=60:
                previous_end=row.fin_en
                row.fin_en=end
                row.duracion_total_minutos=60
                row.save(update_fields=['fin_en','duracion_total_minutos'])
                record(actor,row,'AJUSTAR_CUPO_DEMO',{'fin_anterior':previous_end.isoformat(),'fin_nuevo':end.isoformat(),'cupo_minutos':60})
                changed+=1
        days=0
        for schedule in DailySchedule.objects.select_for_update().filter(profesional_id__in=professional_ids,fecha__range=(first,first+timedelta(days=6))):
            intervals=[{'inicio':time(hour),'fin':time(hour+1),'cupo_unico':True} for hour in [10,11,12,14,15,16,17,18,19]]
            expected=[{'inicio':item['inicio'].strftime('%H:%M'),'fin':item['fin'].strftime('%H:%M'),'cupo_unico':True} for item in intervals]
            if schedule.franjas!=expected:
                daily_schedule.save({'fecha':schedule.fecha,'profesional_id':schedule.profesional_id,'franjas':intervals},actor)
                days+=1
        if finances()!=before:
            raise RuntimeError('Financial records must remain unchanged.')
        result={'marker':marker,'applied':apply,'appointments_checked':len(rows),'appointments_corrected':changed,'days_corrected':days,'slot_minutes':60,'financial_records_unchanged':True}
        if not apply:
            transaction.set_rollback(True)
        return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--marker',default='DEMO-CALENDARIO-'+timezone.now().astimezone(ZONE).strftime('%Y%m%d'))
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    print(json.dumps(repair(args.marker,args.apply),indent=2))
