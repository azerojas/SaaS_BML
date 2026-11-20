from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from types import SimpleNamespace
from django.db import connections, transaction
from django.test import TestCase, override_settings
from rest_framework.exceptions import APIException
from negocio import models as m
from apps.autenticacion.models import LoginAttempt
from apps.checkin.application import commands
from apps.checkin.infrastructure.abuse_protection import consume


@override_settings(CHECKIN_DEMO_MODE=False, CHECKIN_PRIVACY_NOTICE_URL='https://example.com/privacy',CHECKIN_PRIVACY_NOTICE_VERSION='v1')
class CheckinConcurrencyTests(TestCase):
    user=SimpleNamespace(pk=None)
    def isolated(self, function):
        def run():
            try:
                with connections['default'].cursor() as c:c.execute("SET lock_timeout = '8s'")
                return function()
            finally:connections['default'].close()
        with ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(run).result(timeout=20)
    def race(self, functions):
        barrier=Barrier(len(functions))
        def run(function):
            try:
                with connections['default'].cursor() as c:c.execute("SET lock_timeout = '8s'")
                barrier.wait(timeout=10)
                return ('ok',function())
            except APIException as exc:return (exc.status_code,None)
            finally:connections['default'].close()
        with ThreadPoolExecutor(max_workers=len(functions)) as pool:
            return list(pool.map(run,functions))
    def seed(self):
        def create():
            point=m.PuntosQr.objects.create(nombre='QR ficticio')
            return str(point.token)
        return self.isolated(create)
    def propose(self,token):
        return commands.request_arrival(token,{'telefono':'+51999888777','nombres':'Ficticia','apellidos':'Concurrencia','consentimiento_datos':True,'version_aviso':'v1'})
    def cleanup(self):
        def remove():
            assert connections['default'].settings_dict['NAME'].startswith('test_lasheo_phase1_')
            with transaction.atomic():
                m.Visitas.objects.all().delete()
                m.Llegadas.objects.all().delete()
                m.Clientas.objects.all().delete()
                m.PuntosQr.objects.all().delete()
                m.Auditoria.objects.filter(usuario_id__isnull=True).delete()
                LoginAttempt.objects.all().delete()
        self.isolated(remove)

    def test_simultaneous_public_requests_create_one_proposal_and_pending_arrival(self):
        try:
            token=self.seed()
            results=self.race([lambda:self.propose(token),lambda:self.propose(token)])
            self.assertEqual({status for status,_ in results},{'ok'})
            self.assertEqual(self.isolated(lambda:(m.Clientas.objects.count(),m.Llegadas.objects.count(),m.Visitas.objects.count())),(1,1,0))
        finally:self.cleanup()

    def test_simultaneous_self_registration_opens_only_one_visit(self):
        try:
            first = self.seed()
            second = self.seed()
            data = {'telefono': '+51999888777', 'nombres': 'Nueva', 'apellidos': 'Ficticia',
                    'consentimiento_datos': True, 'version_aviso': 'v1'}
            results = self.race([lambda: commands.register_visit(first, data),
                                 lambda: commands.register_visit(second, data)])
            self.assertEqual({status for status, _ in results}, {'ok'})
            self.assertEqual(len({visit.pk for _, visit in results}), 1)
            self.assertEqual(self.isolated(lambda: (
                m.Clientas.objects.count(), m.Llegadas.objects.count(), m.Visitas.objects.count())),
                (1, 1, 1))
        finally:self.cleanup()

    def test_global_pending_constraint_applies_across_two_qr_points(self):
        try:
            first=self.seed()
            second=self.seed()
            results=self.race([lambda:self.propose(first),lambda:self.propose(second)])
            self.assertEqual({status for status,_ in results},{'ok'})
            self.assertEqual(self.isolated(lambda:m.Llegadas.objects.filter(estado='PENDIENTE').count()),1)
        finally:self.cleanup()

    def test_confirmation_and_rejection_cannot_both_succeed(self):
        try:
            token=self.seed()
            self.isolated(lambda:self.propose(token))
            pk=self.isolated(lambda:m.Llegadas.objects.get().pk)
            results=self.race([lambda:commands.confirm_arrival(pk,{'identidad_verificada':True,'consentimiento_verificado':True},self.user),
                               lambda:commands.resolve_arrival(pk,'RECHAZADA',{},self.user)])
            self.assertEqual({status for status,_ in results},{'ok',409})
            def verify():
                obj=m.Llegadas.objects.select_related('clienta').get(pk=pk)
                return obj.estado,obj.clienta.activa,obj.clienta.consentimiento_datos
            state,active,consent=self.isolated(verify)
            self.assertEqual(active,state=='CONFIRMADA')
            self.assertEqual(consent,state=='CONFIRMADA')
        finally:self.cleanup()

    def test_two_create_visit_requests_result_in_one_visit(self):
        try:
            token=self.seed()
            self.isolated(lambda:self.propose(token))
            pk=self.isolated(lambda:m.Llegadas.objects.get().pk)
            self.isolated(lambda:commands.confirm_arrival(pk,{'identidad_verificada':True,'consentimiento_verificado':True},self.user))
            results=self.race([lambda:commands.create_visit(pk,self.user).pk,lambda:commands.create_visit(pk,self.user).pk])
            self.assertEqual({status for status,_ in results},{'ok'})
            self.assertEqual(results[0][1],results[1][1])
            self.assertEqual(self.isolated(lambda:m.Visitas.objects.count()),1)
        finally:self.cleanup()

    def test_associate_existing_visit_and_create_new_preserve_one_link(self):
        try:
            token=self.seed()
            self.isolated(lambda:self.propose(token))
            pk=self.isolated(lambda:m.Llegadas.objects.get().pk)
            self.isolated(lambda:commands.confirm_arrival(pk,{'identidad_verificada':True,'consentimiento_verificado':True},self.user))
            legacy=self.isolated(lambda:m.Visitas.objects.create(clienta_id=m.Llegadas.objects.get(pk=pk).clienta_id).pk)
            results=self.race([lambda:commands.create_visit(pk,self.user).pk,lambda:commands.associate_visit(pk,legacy,self.user).pk])
            self.assertIn('ok',[status for status,_ in results])
            self.assertEqual(self.isolated(lambda:m.Visitas.objects.filter(llegada_id=pk).count()),1)
        finally:self.cleanup()

    def test_rate_limit_is_shared_under_simultaneous_workers(self):
        try:
            results=self.race([lambda:consume([('concurrency-test','opaque',1,60)]),lambda:consume([('concurrency-test','opaque',1,60)])])
            self.assertEqual({status for status,_ in results},{'ok',429})
            self.assertEqual(self.isolated(lambda:LoginAttempt.objects.get().attempts),2)
        finally:self.cleanup()

