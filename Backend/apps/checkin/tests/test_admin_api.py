from datetime import timedelta
from io import StringIO
from django.core.management import call_command
from django.utils import timezone
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient
from negocio import models as m
from .base import ADMIN, CheckinTestCase


class AdminTests(CheckinTestCase):
    def test_admin_expiry_records_operator_and_uses_cancelled_state(self):
        arrival=self.propose()
        m.Llegadas.objects.filter(pk=arrival.pk).update(solicitada_en=timezone.now()-timedelta(hours=3))
        r=self.client.post(ADMIN+'llegadas/expirar/',{},format='json')
        self.assertEqual(r.status_code,200)
        self.assertEqual(r.json()['canceladas'],1)
        event=m.Auditoria.objects.get(accion='EXPIRAR')
        self.assertEqual(event.usuario_id,self.admin.pk)
        self.assertEqual(m.Llegadas.objects.get(pk=arrival.pk).estado,'CANCELADA')

    def test_confirmed_arrival_cannot_be_rejected_or_cancelled(self):
        arrival=self.propose()
        self.confirm(arrival)
        for action in ['rechazar','cancelar']:
            self.assertEqual(self.client.post(self.path(arrival,action),{},format='json').status_code,409)

    def test_private_inbox_has_no_per_row_queries(self):
        for i in range(21):
            person=self.person(phone='+5199900'+str(i).zfill(4))
            m.Llegadas.objects.create(clienta_id=person.pk,origen='MANUAL')
        with CaptureQueriesContext(connection) as queries:
            r=self.client.get(ADMIN+'llegadas/',{'page_size':20})
            self.assertEqual(len(r.json()['results']),20)
        self.assertLessEqual(len(queries),3)

    def test_point_server_generated_token_and_qr_outputs(self):
        self.assertIsNotNone(self.point.token)
        path=ADMIN+'puntos/'+str(self.point.pk)+'/'
        self.assertEqual(self.client.get(ADMIN+'puntos/').status_code,200)
        self.assertEqual(self.client.patch(path,{'nombre':'Otra entrada'},format='json').status_code,200)
        self.assertEqual(self.client.post(ADMIN+'puntos/',{'nombre':'Otro','token':str(self.point.token)},format='json').status_code,400)
        link=self.client.get(path+'qr/').json()['enlace']
        self.assertEqual(link,'https://app.example.com/checkin/'+str(self.point.token)+'/')
        svg=self.client.get(path+'qr/',{'formato':'svg'})
        png=self.client.get(path+'qr/',{'formato':'png'})
        self.assertEqual(svg.status_code,200)
        self.assertIn(b'<svg',svg.content)
        self.assertTrue(png.content.startswith(b'\x89PNG\r\n\x1a\n'))
        self.assertEqual(svg['Cache-Control'],'no-store, private')
        self.assertEqual(self.client.get(path+'qr/',{'formato':'bad'}).status_code,400)
        self.assertEqual(self.client.delete(path).status_code,405)
        self.client.patch(path,{'activo':False},format='json')
        self.assertEqual(self.client.get(path+'qr/').status_code,404)

    def test_provisional_confirmation_requires_human_flags_and_audits_actor(self):
        arrival=self.propose()
        self.assertEqual(self.confirm(arrival,identidad_verificada=False).status_code,400)
        self.assertEqual(self.confirm(arrival,consentimiento_verificado=False).status_code,400)
        self.assertEqual(self.client.post(self.path(arrival,'crear-visita'),{},format='json').status_code,409)
        r=self.confirm(arrival)
        self.assertEqual(r.status_code,200,r.data)
        self.assertFalse(r.json()['alta_provisional'])
        arrival.refresh_from_db()
        client=arrival.clienta
        self.assertTrue(client.activa)
        self.assertTrue(client.consentimiento_datos)
        self.assertIsNotNone(client.consentimiento_fecha)
        self.assertEqual(arrival.confirmada_por_id,self.admin.pk)
        self.assertIsNotNone(arrival.confirmada_en)
        audit=m.Auditoria.objects.filter(entidad='llegadas',accion='CONFIRMAR').get()
        self.assertEqual(audit.usuario_id,self.admin.pk)
        self.assertEqual(self.confirm(arrival).status_code,409)

    def test_existing_confirmation_does_not_forge_consent(self):
        person=self.person()
        self.post()
        arrival=m.Llegadas.objects.get()
        self.assertEqual(self.confirm(arrival,consentimiento_verificado=False).status_code,200)
        person.refresh_from_db()
        self.assertFalse(person.consentimiento_datos)

    def test_reject_cancel_invalid_transitions_and_historical_arrivals(self):
        person=self.person()
        self.post()
        first=m.Llegadas.objects.get()
        r=self.client.post(self.path(first,'rechazar'),{'motivo':'No corresponde a la ficha'},format='json')
        self.assertEqual(r.status_code,200)
        self.assertEqual(r.json()['estado'],'RECHAZADA')
        self.assertEqual(self.confirm(first).status_code,409)
        self.assertEqual(self.client.post(self.path(first,'cancelar'),{},format='json').status_code,409)
        self.assertEqual(self.post().status_code,202)
        second=m.Llegadas.objects.get(estado='PENDIENTE')
        self.assertNotEqual(first.pk,second.pk)
        self.assertEqual(m.Llegadas.objects.filter(clienta_id=person.pk).count(),2)
        self.assertEqual(self.client.post(self.path(second,'cancelar'),{'motivo':'Se retiro'},format='json').status_code,200)
        resolution=m.Auditoria.objects.filter(entidad='llegadas',accion='CANCELAR').get()
        self.assertEqual(resolution.datos['motivo'],'Se retiro')
        self.assertIsNotNone(resolution.creada_en)

    def test_private_filters_order_pagination_and_no_notes_in_list(self):
        a=self.person(notas_privadas='SECRETO')
        self.post()
        b=self.person('+51999123457',nombres='María')
        self.post(telefono=b.telefono)
        self.assertEqual(self.client.get(ADMIN+'llegadas/',{'search':'maria'}).json()['count'],1)
        response=self.client.get(ADMIN+'llegadas/',{'page_size':1}).json()
        self.assertEqual(response['count'],2)
        self.assertIsNotNone(response['next'])
        self.assertEqual(response['results'][0]['clienta_id'],b.pk)
        self.assertNotIn('SECRETO',str(response))
        self.assertEqual(self.client.get(ADMIN+'llegadas/',{'estado':'bad'}).status_code,400)
        self.assertEqual(self.client.get(ADMIN+'llegadas/',{'vigentes':'bad'}).status_code,400)

    def test_expiry_command_preserves_history_and_private_job_actor(self):
        arrival=self.propose()
        m.Llegadas.objects.filter(pk=arrival.pk).update(solicitada_en=timezone.now()-timedelta(hours=3))
        self.assertEqual(self.client.get(ADMIN+'llegadas/').json()['count'],0)
        self.assertEqual(self.client.get(ADMIN+'llegadas/',{'vigentes':'false'}).json()['count'],1)
        self.assertEqual(self.confirm(arrival).status_code,409)
        output=StringIO()
        call_command('expire_checkins',stdout=output)
        arrival.refresh_from_db()
        self.assertEqual(arrival.estado,'CANCELADA')
        self.assertTrue(m.Auditoria.objects.filter(entidad='llegadas',accion='EXPIRAR',usuario_id__isnull=True).exists())
        call_command('expire_checkins',stdout=output)
        self.assertEqual(m.Auditoria.objects.filter(accion='EXPIRAR').count(),1)

    def test_manual_arrival_for_active_existing_person(self):
        person=self.person()
        r=self.client.post(ADMIN+'llegadas/',{'clienta_id':person.pk},format='json')
        self.assertEqual(r.status_code,201,r.data)
        self.assertEqual(r.json()['origen'],'MANUAL')
        self.assertIsNone(r.json()['punto_qr_id'])
        self.assertEqual(self.client.post(ADMIN+'llegadas/',{'clienta_id':person.pk},format='json').status_code,409)

    def test_all_admin_routes_reject_nonstaff_and_anonymous_and_require_csrf(self):
        paths=[('get','puntos/'),('post','puntos/'),('get','puntos/1/'),('patch','puntos/1/'),('get','puntos/1/qr/'),
               ('get','llegadas/'),('post','llegadas/'),('get','llegadas/1/'),('post','llegadas/expirar/')]
        paths += [('post','llegadas/1/'+action+'/') for action in ['confirmar','rechazar','cancelar','crear-visita','asociar-visita','enlazar-cita']]
        for user in [None,self.regular]:
            client=APIClient()
            if user:client.force_authenticate(user)
            for method,path in paths:
                self.assertEqual(getattr(client,method)(ADMIN+path,{},format='json').status_code,403,(user,method,path))
        client=APIClient(enforce_csrf_checks=True)
        client.force_login(self.admin)
        for method,path in paths:
            if method in ['post','patch']:
                self.assertEqual(getattr(client,method)(ADMIN+path,{},format='json').status_code,403)
        client.get('/api/auth/csrf/')
        self.assertEqual(client.post(ADMIN+'puntos/',{'nombre':'QR con CSRF'},format='json',HTTP_X_CSRFTOKEN=client.cookies['csrftoken'].value).status_code,201)

