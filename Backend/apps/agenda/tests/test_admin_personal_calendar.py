from unittest.mock import patch
from django.contrib.auth.models import Permission
from rest_framework.test import APIClient
from negocio import models as m
from .base import AgendaTestCase, API


class AdminPersonalCalendarTests(AgendaTestCase):
    endpoint = API + 'profesionales/mi-agenda/'

    def test_account_activates_own_calendar_once_without_additional_form(self):
        self.admin.first_name = 'Ana'
        self.admin.last_name = 'Administradora'
        self.admin.save(update_fields=['first_name','last_name'])
        response = self.client.post(self.endpoint, {}, format='json')
        self.assertEqual(response.status_code,200,response.data)
        data=response.json()
        self.assertEqual((data['nombres'],data['apellidos'],data['usuario_id']),('Ana','Administradora',self.admin.pk))
        self.assertTrue(data['activa'])
        self.assertTrue(data['visible_reservas'])
        self.assertEqual(data['servicios'],[])
        repeated=self.client.post(self.endpoint,{},format='json')
        self.assertEqual(repeated.json()['id'],data['id'])
        self.assertEqual(m.Profesionales.objects.filter(usuario=self.admin).count(),1)
        self.assertEqual(m.Auditoria.objects.filter(accion='ACTIVAR_AGENDA_PERSONAL').count(),1)

    def test_existing_calendar_assignment_and_admin_decisions_are_preserved(self):
        m.Profesionales.objects.filter(pk=self.prof).update(usuario_id=self.admin.pk,activa=False,visible_reservas=False,comision_porcentaje='12.50')
        response=self.client.post(self.endpoint,{},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data['id'],self.prof)
        self.assertEqual(response.data['nombres'],'Profesional')
        self.assertFalse(response.data['activa'])
        self.assertFalse(response.data['visible_reservas'])
        self.assertEqual(response.data['comision_porcentaje'],'12.50')
        self.assertEqual(response.data['servicios'],[self.item.pk])

    def test_session_identity_cannot_be_overridden_or_enabled_by_unprivileged_staff(self):
        self.assertEqual(self.client.post(self.endpoint,{'usuario_id':self.staff.pk},format='json').status_code,400)
        self.assertFalse(m.Profesionales.objects.filter(usuario=self.staff).exists())
        self.staff.user_permissions.add(Permission.objects.get(content_type__app_label='agenda',codename='manage_professionals'))
        client=APIClient()
        client.force_authenticate(self.staff)
        self.assertEqual(client.post(self.endpoint,{},format='json').status_code,403)
        self.assertFalse(m.Profesionales.objects.filter(usuario=self.staff).exists())
        self.assertEqual(APIClient().post(self.endpoint,{},format='json').status_code,403)

    def test_username_fallback_and_failed_audit_leave_no_partial_registration(self):
        with patch('apps.agenda.application.administration.record',side_effect=RuntimeError('audit failure')):
            with self.assertRaises(RuntimeError):
                self.client.post(self.endpoint,{},format='json')
        self.assertFalse(m.Profesionales.objects.filter(usuario=self.admin).exists())
        response=self.client.post(self.endpoint,{},format='json')
        self.assertEqual(response.data['nombres'],self.admin.username)
        self.assertEqual(response.data['apellidos'],'')
