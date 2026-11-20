import uuid
from unittest.mock import patch
from django.test import override_settings
from negocio import models as m
from apps.autenticacion.models import LoginAttempt
from .base import ADMIN, PUBLIC, CheckinTestCase


class PublicTests(CheckinTestCase):
    def test_unique_collision_never_leaks_as_public_conflict(self):
        from apps.catalogo.services import CatalogConflict
        with patch('apps.checkin.application.commands.register_visit',side_effect=CatalogConflict('Conflicto privado','duplicado_checkin')):
            response=self.post()
        self.assertEqual(response.status_code,202)
        self.assertNotIn('Conflicto privado',str(response.data))

    def test_point_token_is_not_administrative_authentication(self):
        self.assertEqual(self.public.get(ADMIN+'llegadas/',HTTP_AUTHORIZATION='Bearer '+str(self.point.token)).status_code,403)

    def test_form_config_has_no_people_or_internal_ids(self):
        self.person(notas_privadas='SECRETO FICTICIO')
        response=self.public.get(self.url)
        self.assertEqual(response.status_code,200)
        data=response.json()
        self.assertEqual(set(data),{'establecimiento','requiere_confirmacion_presencial','consentimiento_preseleccionado','aviso_privacidad','campos'})
        self.assertFalse(data['consentimiento_preseleccionado'])
        self.assertNotIn('Daniela',str(data))
        self.assertNotIn('999123456',str(data))
        self.assertNotIn('SECRETO',str(data))

    def test_uniform_existing_unknown_inactive_and_duplicate_responses(self):
        unknown=self.post()
        self.assertEqual(unknown.status_code,202)
        self.assertFalse(m.Clientas.objects.exists())
        client=self.person()
        known=self.post()
        duplicate=self.post()
        m.Clientas.objects.filter(pk=client.pk).update(activa=False)
        inactive=self.post()
        for r in [known,duplicate,inactive]:
            self.assertEqual(r.status_code,202)
            self.assertEqual(r.json(),unknown.json())
        self.assertEqual(m.Llegadas.objects.count(),1)
        self.assertNotIn('request_id',known.json())

    def test_new_registration_opens_visit_with_declared_consent(self):
        self.post(nombres='Daniela',apellidos='Ficticia',consentimiento_datos=True,version_aviso='v1')
        arrival=m.Llegadas.objects.get()
        client=arrival.clienta
        self.assertTrue(client.activa)
        self.assertTrue(client.consentimiento_datos)
        self.assertIsNotNone(client.consentimiento_fecha)
        self.assertFalse(client.acepta_recordatorios)
        self.assertEqual(arrival.estado,'CONFIRMADA')
        self.assertEqual(arrival.origen,'QR')
        self.assertEqual(arrival.punto_qr_id,self.point.pk)
        self.assertEqual(m.Visitas.objects.count(),1)
        self.assertEqual(m.Ventas.objects.count(),0)
        self.assertEqual(m.MovimientosInventario.objects.count(),0)

    def test_unknown_requires_full_names_explicit_consent_and_current_notice(self):
        for payload in [
            {},{'nombres':'Nueva'},{'nombres':'Nueva','apellidos':'Ficticia'},
            {'nombres':'Nueva','apellidos':'Ficticia','consentimiento_datos':False,'version_aviso':'v1'},
            {'nombres':'Nueva','apellidos':'Ficticia','consentimiento_datos':True,'version_aviso':'old'}]:
            self.assertEqual(self.post(**payload).status_code,202)
            self.assertEqual(m.Clientas.objects.count(),0)
        with override_settings(CHECKIN_PRIVACY_NOTICE_URL=''):
            self.assertEqual(self.post(nombres='Nueva',apellidos='Ficticia',consentimiento_datos=True,version_aviso='v1').status_code,202)
        self.assertEqual(m.Clientas.objects.count(),0)

    def test_existing_person_is_not_overwritten_from_public_payload(self):
        client=self.person(notas_privadas='Solo recepcion')
        r=self.post(nombres='Impostora',apellidos='Cambio',consentimiento_datos=True,version_aviso='v1')
        self.assertEqual(r.status_code,202)
        client.refresh_from_db()
        self.assertEqual(client.nombres,'Daniela')
        self.assertEqual(client.notas_privadas,'Solo recepcion')
        self.assertFalse(client.consentimiento_datos)

    def test_phone_normalization_and_ambiguous_legacy_records(self):
        client=self.person(phone='999 123 456')
        self.assertEqual(self.post().status_code,202)
        self.assertEqual(m.Llegadas.objects.get().clienta_id,client.pk)
        m.Clientas.objects.create(nombres='Otra',apellidos='Ficticia',telefono='+51999123456',activa=True,acepta_recordatorios=False)
        self.assertEqual(self.post().status_code,202)
        self.assertEqual(m.Llegadas.objects.count(),1)

    def test_invalid_payload_and_methods_never_echo_private_values(self):
        for data in [{'telefono':'secreto-invalido'},{'telefono':'+51999123456','clienta_id':1},
                     {'telefono':'+51999123456','notas_privadas':'NO PUBLICAR'},
                     {'telefono':'+51999123456','consentimiento_datos':'true'},
                     {'telefono':'+51999123456','nombres':' '}]:
            r=self.public.post(self.url,data,format='json')
            self.assertEqual(r.status_code,400,r.data)
            self.assertNotIn('secreto-invalido',str(r.data))
            self.assertNotIn('NO PUBLICAR',str(r.data))
        self.assertEqual(self.public.post(self.url,'texto',content_type='text/plain').status_code,415)
        self.assertEqual(self.public.post(self.url,'{'+' '*9000,content_type='application/json').status_code,400)
        self.assertEqual(self.public.post(self.url,'['*1100+']'*1100,content_type='application/json').status_code,400)
        for method in ['put','patch','delete']:
            self.assertEqual(getattr(self.public,method)(self.url,{},format='json').status_code,405)

    def test_revoked_or_unknown_point_never_accepts_arrival(self):
        self.person()
        self.client.patch(ADMIN+'puntos/'+str(self.point.pk)+'/',{'activo':False},format='json')
        self.assertEqual(self.public.get(self.url).status_code,404)
        self.assertEqual(self.post().status_code,404)
        self.assertEqual(self.public.get(PUBLIC+str(uuid.uuid4())+'/').status_code,404)
        self.assertEqual(m.Llegadas.objects.count(),0)

    @override_settings(CHECKIN_POST_IP_LIMIT=2)
    def test_shared_ip_limits_before_phone_or_point_lookup(self):
        self.assertEqual(self.post().status_code,202)
        other=type(self.public)()
        self.assertEqual(other.post(self.url,{'telefono':'+51999123457'},format='json',HTTP_X_FORWARDED_FOR='1.2.3.4').status_code,202)
        r=self.post()
        self.assertEqual(r.status_code,429)
        self.assertIn('Retry-After',r)
        for counter in LoginAttempt.objects.all():
            self.assertEqual(len(counter.key),64)
            self.assertNotIn('999123456',counter.key)

    @override_settings(CHECKIN_PHONE_LIMIT=1)
    def test_phone_limit_cannot_be_bypassed_by_normalized_format_or_ip(self):
        self.assertEqual(self.post().status_code,202)
        r=self.public.post(self.url,{'telefono':'999 123 456'},format='json',REMOTE_ADDR='203.0.113.99')
        self.assertEqual(r.status_code,429)

    @override_settings(CHECKIN_DEMO_MODE=True,DEBUG=True)
    def test_local_notice_is_clearly_fictitious(self):
        r=self.public.get(PUBLIC+'aviso-prueba/')
        self.assertEqual(r.status_code,200)
        self.assertTrue(r.json()['solo_pruebas'])
        self.assertFalse(r.json()['consentimiento_preseleccionado'])
        self.assertIn('ficticios',r.json()['texto'])

    @override_settings(CHECKIN_DEMO_MODE=True,DEBUG=False)
    def test_demo_cannot_serve_in_production_mode(self):
        self.assertEqual(self.public.get(self.url).status_code,503)
        self.assertEqual(self.post().status_code,503)

    def test_public_session_does_not_grant_admin_access(self):
        self.person()
        self.post()
        self.assertEqual(self.public.get(ADMIN+'llegadas/').status_code,403)
        self.assertEqual(self.public.get(ADMIN+'puntos/').status_code,403)

