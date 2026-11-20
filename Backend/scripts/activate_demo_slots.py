"""Activate personal cupos and the public booking channel on the local demo only."""
import argparse
from datetime import date, time, timedelta
import json
import os
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
PRIVATE=Path.home()/'.codex/lasheo-private/local-operation'
sys.path.insert(0,str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()

from django.core.management import call_command
from django.db import connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.contrib.auth import get_user_model
from apps.agenda.application import daily_schedule
from apps.agenda.models import DailySchedule
from negocio import models as m
from scripts.provision_demo_specialists import provision


def activate(apply=False):
    if connection.settings_dict['NAME'].casefold()!='lasheo' or connection.settings_dict['HOST'] not in ('localhost','127.0.0.1'):
        raise RuntimeError('Local Lasheo database required.')
    manifest=json.loads((PRIVATE/'demo-system-manifest.json').read_text(encoding='utf-8'))
    target=[('agenda','0007_own_schedule_permission')]
    plan=MigrationExecutor(connection).migration_plan(target)
    if any(backwards or migration.name!='0007_own_schedule_permission' or migration.app_label!='agenda' for migration,backwards in plan):
        raise RuntimeError('Unexpected migration plan; nothing was changed.')
    if not apply:
        return {'apply':False,'migration':[migration.name for migration,_ in plan],'professionals':manifest['professionals'],'dates':'2026-11-19..2026-11-25'}
    call_command('migrate','agenda','0007_own_schedule_permission',interactive=False,verbosity=0)
    provision(True)
    created=[]
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute('SELECT pg_advisory_xact_lock(718302455)')
        for identifier in manifest['professionals']:
            professional=m.Profesionales.objects.select_related('usuario').get(pk=identifier,activa=True)
            if not professional.usuario or not professional.usuario.has_perm('agenda.manage_own_schedule'):
                raise RuntimeError('An assigned specialist account is required.')
            for offset in range(7):
                day=date(2026,11,19)+timedelta(days=offset)
                if DailySchedule.objects.filter(profesional_id=identifier,fecha=day).exists():
                    continue
                windows=[{'inicio':time(hour),'fin':time(hour+2),'cupo_unico':True} for hour in [14,16,18]]
                # Preserve the existing morning demo appointments without moving them.
                if offset<3:
                    windows.insert(0,{'inicio':time(10),'fin':time(13),'cupo_unico':True})
                daily_schedule.save({'profesional_id':identifier,'fecha':day,'franjas':windows},professional.usuario)
                created.append({'professional_id':identifier,'date':str(day),'starts':[row['inicio'].strftime('%H:%M') for row in windows]})
        m.Servicios.objects.filter(pk__in=m.Servicios.objects.filter(slug__startswith='demo-').values('pk')).update(reservable_online=True)
    # Only local files are changed; no credentials are emitted or copied into source.
    for filename in ['runtime.env','runtime-windows.env']:
        file=PRIVATE/filename
        lines=file.read_text(encoding='utf-8').splitlines()
        for key in ['AGENDA_PUBLIC_READ_ENABLED','AGENDA_PUBLIC_WRITE_ENABLED']:
            lines=[line for line in lines if not line.startswith(key+'=')]
            lines.append(key+'=True')
        file.write_text('\n'.join(lines)+'\n',encoding='utf-8')
    report={'activated':True,'created_schedules':created,'public_channel':'loopback HTTPS only','permission':'agenda.manage_own_schedule'}
    (PRIVATE/'demo-slot-activation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    return report


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    print(json.dumps(activate(parser.parse_args().apply),indent=2))
