import logging
from datetime import timedelta
from django.conf import settings
from django.db import connection
from django.utils import timezone
from django.core.exceptions import ImproperlyConfigured
from apps.operaciones.models import JobState
from apps.autenticacion.models import LoginAttempt
from django.contrib.sessions.models import Session
from apps.agenda.application.expiry import expire_pending
from apps.checkin.application.commands import expire_pending as expire_checkins
from apps.agenda.models import PublicBookingRequest
from django.db.migrations.recorder import MigrationRecorder

log=logging.getLogger('beauty.operations')


def maintenance(limit=500,max_batches=20):
    if not settings.ALLOW_MAINTENANCE_JOBS:raise ImproperlyConfigured('Activar jobs requiere ALLOW_MAINTENANCE_JOBS explicito.')
    if not 1<=limit<=500 or not 1<=max_batches<=20:raise ValueError('Limites de mantenimiento invalidos.')
    with connection.cursor() as cursor:
        cursor.execute('SELECT pg_try_advisory_lock(718302480)')
        acquired=cursor.fetchone()[0]
    if not acquired:return {'skipped':True}
    state=None
    try:
        state,_=JobState.objects.get_or_create(key='maintenance')
        state.status='RUNNING'
        state.started_at=timezone.now()
        state.summary={}
        state.save()
        totals={'expiradas':0,'regularizadas':0,'checkins_expirados':0,'batches':0}
        for _ in range(max_batches):
            result=expire_pending(limit=limit)
            totals['expiradas']+=result['expiradas']
            totals['regularizadas']+=result['regularizadas']
            totals['batches']+=1
            if result['revisadas']<limit:break
        totals['checkins_expirados']=expire_checkins(limit=limit)
        # Longest configured abuse window is one day. Keep seven days; no active counters removed.
        cutoff=timezone.now()-timedelta(days=7)
        keys=list(LoginAttempt.objects.filter(started_at__lt=cutoff).order_by('started_at').values_list('pk',flat=True)[:limit])
        totals['old_counters_removed']=LoginAttempt.objects.filter(pk__in=keys,started_at__lt=cutoff).delete()[0]
        now=timezone.now()
        keys=list(Session.objects.filter(expire_date__lt=now).order_by('expire_date').values_list('pk',flat=True)[:limit])
        totals['expired_sessions_removed']=Session.objects.filter(pk__in=keys,expire_date__lt=now).delete()[0]
        if MigrationRecorder(connection).migration_qs.filter(app='agenda',name='0002_public_booking').exists():
            keys=list(PublicBookingRequest.objects.filter(estado='PENDIENTE',expira_en__lte=now).order_by('expira_en').values_list('pk',flat=True)[:limit])
            totals['expired_booking_requests']=PublicBookingRequest.objects.filter(pk__in=keys,estado='PENDIENTE',expira_en__lte=now).update(estado='EXPIRADA')
        state.status='SUCCESS'
        state.finished_at=timezone.now()
        state.last_success_at=state.finished_at
        state.summary=totals
        state.save()
        log.info('job',extra={'event':'job_success','job':'maintenance'})
        return totals
    except Exception as exc:
        if state:
            state.status='FAILED'
            state.finished_at=timezone.now()
            state.summary={'error_type':type(exc).__name__}
            state.save()
        log.error('job',extra={'event':'job_failure','job':'maintenance','error_type':type(exc).__name__})
        raise
    finally:
        with connection.cursor() as cursor:cursor.execute('SELECT pg_advisory_unlock(718302480)')
