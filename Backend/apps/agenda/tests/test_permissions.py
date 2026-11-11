from unittest.mock import patch
from django.test import override_settings
from rest_framework.test import APIClient
from apps.agenda.domain.errors import AgendaError
from .base import AgendaTestCase,API


class PermissionTests(AgendaTestCase):
    def routes(self):
        result=[]
        for resource in ['profesionales','horarios','bloqueos','citas','lista-espera']:
            result.extend([('get',resource+'/'),('get',resource+'/1/'),('post',resource+'/')])
        result+=[('patch','profesionales/1/'),('put','profesionales/1/especialidades/'),('get','profesionales/1/especialidades/')]
        for resource in ['horarios','bloqueos']:result+=[('patch',resource+'/1/'),('delete',resource+'/1/')]
        result+=[('post','citas/1/'+name+'/') for name in ['reprogramar','cancelar','confirmar','completar','no-asistio','vincular-llegada']]
        result+=[('post','lista-espera/1/'+name+'/') for name in ['cancelar','oferta-manual','convertir']]
        return result+[('post','citas/expirar/'),('get','calendario/'),('get','calendario/disponibilidad/'),('get','calendario/configuracion/'),('patch','calendario/configuracion/')]

    def test_all_administrative_routes_deny_anonymous_nonstaff_and_unprivileged_staff(self):
        for user in [None,self.regular,self.staff]:
            client=APIClient()
            if user:client.force_authenticate(user)
            for method,path in self.routes():
                with self.subTest(method=method,path=path,user=user):
                    self.assertEqual(getattr(client,method)(API+path,{},format='json').status_code,403)

    def test_every_mutation_requires_csrf_and_valid_session_succeeds(self):
        client=APIClient(enforce_csrf_checks=True)
        client.force_login(self.admin)
        for method,path in self.routes():
            if method not in ('get',):self.assertEqual(getattr(client,method)(API+path,{},format='json').status_code,403)
        client.get('/api/auth/csrf/')
        response=client.post(API+'citas/',self.booking(),format='json',HTTP_X_CSRFTOKEN=client.cookies['csrftoken'].value,
            HTTP_IDEMPOTENCY_KEY='550e8400-e29b-41d4-a716-446655440000')
        self.assertEqual(response.status_code,201,response.data)

    def test_missing_key_sensitive_input_and_persistent_response_privacy(self):
        self.assertEqual(self.client.post(API+'citas/',self.booking(),format='json').status_code,400)
        for field,value in [('estado','CONFIRMADA'),('precio_total','1.00'),('token_gestion','secret')]:
            self.call('citas/',{**self.booking(),field:value},status=400)
        self.reserve(notas='Nota privada ficticia')
        from apps.finanzas.models import IdempotencyRecord
        stored=str(list(IdempotencyRecord.objects.filter(operation='agenda.cita.crear').values_list('response_body',flat=True)))
        for forbidden in ['token_gestion','codigo_reserva','Nota privada','Daniela','telefono']:self.assertNotIn(forbidden,stored)

    def test_public_throttle_no_identity_lookup_no_management_mutations(self):
        public=APIClient()
        with override_settings(AGENDA_PUBLIC_REQUEST_LIMIT=2):
            for _ in range(2):self.assertEqual(public.get('/api/v1/public/agenda/profesionales/').status_code,200)
            self.assertEqual(public.get('/api/v1/public/agenda/profesionales/').status_code,429)
        for token in ['550e8400-e29b-41d4-a716-446655440000','invalid-token']:
            self.assertEqual(public.post('/api/v1/public/agenda/citas/'+token+'/cancelar/',{},format='json').status_code,404)
        self.assertEqual(public.get(API+'citas/',{'telefono':'+51999123456'}).status_code,403)

    def test_activation_guard_and_read_filters(self):
        with patch('apps.agenda.presentation.views.ensure_ready',side_effect=AgendaError('AGENDA_NOT_ACTIVATED','Pendiente','unavailable')):
            self.assertEqual(self.client.get(API+'citas/').status_code,503)
        for filters in [{'estado':'PAGADA'},{'desde':'2026-11-10'},{'desde':'2026-11-11','hasta':'2026-11-10'},{'ordering':'token_gestion'},{'telefono':'+51999123456'}]:
            self.assertEqual(self.client.get(API+'citas/',filters).status_code,400)
