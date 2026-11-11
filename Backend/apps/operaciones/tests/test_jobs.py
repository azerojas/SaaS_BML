from datetime import timedelta
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from unittest.mock import patch
from django.test import override_settings
from django.core.exceptions import ImproperlyConfigured
from django.db import connections,connection
from negocio import models as m
from apps.agenda.tests.base import AgendaTestCase,NOW
from apps.operaciones.application.jobs import maintenance
from apps.operaciones.models import JobState
from apps.operaciones.domain.alerts import stale_jobs


class JobTests(AgendaTestCase):
    @override_settings(ALLOW_MAINTENANCE_JOBS=True)
    def test_cleanup_retains_live_sessions_and_recent_abuse_counters(self):
        from django.contrib.sessions.models import Session
        from apps.autenticacion.models import LoginAttempt
        from django.utils import timezone
        now=timezone.now()
        Session.objects.create(session_key='expired',session_data='',expire_date=now-timedelta(seconds=1))
        Session.objects.create(session_key='active',session_data='',expire_date=now+timedelta(days=1))
        LoginAttempt.objects.create(key='old',started_at=now-timedelta(days=8))
        LoginAttempt.objects.create(key='recent',started_at=now-timedelta(hours=23))
        result=maintenance()
        self.assertEqual(result['old_counters_removed'],1)
        self.assertEqual(result['expired_sessions_removed'],1)
        self.assertTrue(Session.objects.filter(pk='active').exists())
        self.assertTrue(LoginAttempt.objects.filter(pk='recent').exists())

    def _fixture_teardown(self):
        assert connection.settings_dict['NAME'].startswith('test_lasheo_phase1_')
        JobState.objects.all().delete()
        super()._fixture_teardown()

    def test_jobs_are_disabled_until_explicitly_enabled(self):
        with self.assertRaises(ImproperlyConfigured):maintenance()
        self.assertFalse(JobState.objects.exists())

    @override_settings(ALLOW_MAINTENANCE_JOBS=True)
    def test_actual_expiration_is_idempotent_and_has_success_heartbeat(self):
        m.Servicios.objects.filter(pk=self.item.pk).update(requiere_anticipo=True)
        pk=self.reserve()
        m.Citas.objects.filter(pk=pk).update(expira_en=NOW-timedelta(minutes=1))
        first=maintenance()
        second=maintenance()
        self.assertEqual(first['expiradas'],1)
        self.assertEqual(second['expiradas'],0)
        self.assertEqual(m.Citas.objects.get(pk=pk).estado,'EXPIRADA')
        state=JobState.objects.get(key='maintenance')
        self.assertEqual(state.status,'SUCCESS')
        self.assertIsNotNone(state.last_success_at)

    @override_settings(ALLOW_MAINTENANCE_JOBS=True)
    def test_failure_records_only_type_and_raises(self):
        with patch('apps.operaciones.application.jobs.expire_pending',side_effect=RuntimeError('private details')):
            with self.assertRaises(RuntimeError):maintenance()
        state=JobState.objects.get(key='maintenance')
        self.assertEqual(state.status,'FAILED')
        self.assertEqual(state.summary,{'error_type':'RuntimeError'})

    @override_settings(ALLOW_MAINTENANCE_JOBS=True)
    def test_two_independent_workers_cannot_run_same_job_together(self):
        entered=Event()
        release=Event()
        def delayed(**kwargs):
            entered.set()
            release.wait(5)
            return {'expiradas':0,'regularizadas':0,'revisadas':0}
        def first():
            try:return maintenance()
            finally:connections['default'].close()
        with patch('apps.operaciones.application.jobs.expire_pending',side_effect=delayed),ThreadPoolExecutor(max_workers=1) as pool:
            future=pool.submit(first)
            self.assertTrue(entered.wait(5))
            self.assertEqual(maintenance(),{'skipped':True})
            release.set()
            future.result(10)

    def test_stale_and_failed_jobs_are_active_findings(self):
        result=stale_jobs({'maintenance':{'status':'FAILED','last_success_at':NOW-timedelta(hours=1)}},NOW)
        self.assertIn({'code':'JOB_STALE','job':'backup','severity':'high'},result)
        self.assertIn({'code':'JOB_FAILED','job':'maintenance','severity':'high'},result)
