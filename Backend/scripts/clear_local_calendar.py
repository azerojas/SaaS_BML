"""Clear the local working calendar, preserving financial/visit history. Default: preview."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import time
from urllib.parse import urlsplit, unquote

ROOT=Path(__file__).resolve().parents[1]
PRIVATE=Path.home()/'.codex/lasheo-private/local-operation'
sys.path.insert(0,str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
import django
django.setup()

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.db.migrations.recorder import MigrationRecorder
from apps.agenda.application.calendar_cleanup import clear_calendar
from apps.agenda.application.selectors import list_rows
from apps.agenda.models import CalendarArchive, DailySchedule
from negocio import models as m


def finance_snapshot():
    return {model._meta.db_table:{'count':model.objects.count(),
        'sha256':hashlib.sha256(json.dumps(list(model.objects.order_by('pk').values()),default=str,sort_keys=True).encode()).hexdigest()}
        for model in (m.AnticiposCita,m.Pagos,m.Ventas,m.Visitas)}


def run(apply=False):
    if connection.settings_dict['NAME'].casefold()!='lasheo' or connection.settings_dict['HOST'] not in ('localhost','127.0.0.1'):
        raise RuntimeError('Only the local Lasheo database is supported.')
    ready=MigrationRecorder(connection).migration_qs.filter(app='agenda',name='0008_calendar_archive').exists()
    preview={'appointments':m.Citas.objects.count()-(CalendarArchive.objects.count() if ready else 0),
             'daily_schedules':DailySchedule.objects.count(),'weekly_schedules':m.HorariosProfesional.objects.count(),
             'blocks':m.BloqueosAgenda.objects.count(),'preserved':{model._meta.db_table:model.objects.count() for model in (m.AnticiposCita,m.Pagos,m.Ventas,m.Visitas)}}
    if not apply:
        return {'apply':False,**preview}
    backup=json.loads((PRIVATE/'last-backup-job.json').read_text())
    archive=PRIVATE/'backups'/Path(backup['detail']['encrypted_file']).name
    if backup['status']!='SUCCESS' or not archive.is_file() or time.time()-archive.stat().st_mtime>3600:
        raise RuntimeError('A successful encrypted backup from the last hour is required.')
    if hashlib.sha256(archive.read_bytes()).hexdigest()!=backup['detail']['sha256']:
        raise RuntimeError('Backup checksum mismatch.')
    target=[('agenda','0008_calendar_archive')]
    plan=MigrationExecutor(connection).migration_plan(target)
    if any(backwards or migration.app_label!='agenda' or migration.name!='0008_calendar_archive' for migration,backwards in plan):
        raise RuntimeError('Unexpected migration plan.')
    call_command('migrate','agenda','0008_calendar_archive',interactive=False,verbosity=0)
    with connection.cursor() as cursor:
        for purpose in ('runtime','backup'):
            values=dict(line.split('=',1) for line in (PRIVATE/(purpose+'-windows.env')).read_text().splitlines() if '=' in line and not line.startswith('#'))
            role=unquote(urlsplit(values['DATABASE_URL']).username or '')
            if not role:
                raise RuntimeError('Configured database role unavailable.')
            cursor.execute('GRANT SELECT ON agenda_calendararchive TO '+connection.ops.quote_name(role))
    actor=get_user_model().objects.get(username='operador_local',is_active=True,is_staff=True)
    with transaction.atomic():
        before=finance_snapshot()
        summary=clear_calendar(actor)
        if finance_snapshot()!=before:
            raise RuntimeError('Financial or visit records changed; cleanup rolled back.')
        if list_rows('citas',{}).exists() or DailySchedule.objects.exists() or m.HorariosProfesional.objects.exists() or m.BloqueosAgenda.objects.exists():
            raise RuntimeError('Calendar verification failed; cleanup rolled back.')
    report={'apply':True,**summary,'calendar_appointments':0,'financial_and_visit_records_unchanged':True,
            'preserved':preview['preserved'],'backup':archive.name}
    (PRIVATE/'calendar-cleanup.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    return report


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    print(json.dumps(run(parser.parse_args().apply),indent=2))
