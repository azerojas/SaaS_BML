from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from rest_framework.test import APIClient
from negocio import models as m
from .base import CatalogTestCase, ADMIN


class TreatmentStaffTests(CatalogTestCase):
    def setUp(self):
        super().setUp()
        self.first = m.Profesionales.objects.create(nombres='Ana',apellidos='Ficticia',activa=True)
        self.second = m.Profesionales.objects.create(nombres='Lucia',apellidos='Ficticia',activa=True)

    def test_assign_people_at_creation_edit_and_preserve_on_unrelated_changes(self):
        service = self.service(profesionales_ids=[self.first.pk,self.second.pk])
        self.assertEqual(service['profesionales_ids'],[self.first.pk,self.second.pk])
        self.assertEqual(self.patch('servicios',service['id'],{'precio_base':'95.00'}).json()['profesionales_ids'],service['profesionales_ids'])
        changed = self.patch('servicios',service['id'],{'profesionales_ids':[self.second.pk]})
        self.assertEqual(changed.status_code,200,changed.data)
        self.assertEqual(changed.json()['profesionales_ids'],[self.second.pk])
        self.assertEqual(list(m.ProfesionalServicios.objects.filter(servicio_id=service['id']).values_list('profesional_id',flat=True)),[self.second.pk])
        eligible=self.client.get('/api/v1/agenda/profesionales/',{'servicio_id':service['id']}).json()
        self.assertEqual([row['id'] for row in eligible['results']],[self.second.pk])
        self.assertEqual(self.patch('servicios',service['id'],{'profesionales_ids':[]}).json()['profesionales_ids'],[])

    def test_bad_duplicate_or_inactive_people_do_not_create_treatment(self):
        self.second.activa=False
        self.second.save(update_fields=['activa'])
        for ids in [[999999999],[self.second.pk],[self.first.pk,self.first.pk]]:
            response=self.client.post(ADMIN+'servicios/',{'nombre':'No debe guardarse','precio_base':'25','profesionales_ids':ids},format='json')
            self.assertEqual(response.status_code,400,response.data)
        self.assertEqual(m.Servicios.objects.count(),0)

    def test_assignment_requires_permission_and_audit_failure_rolls_back(self):
        service=self.service(profesionales_ids=[self.first.pk])
        user=get_user_model().objects.create_user('only_catalog_writer',is_staff=True)
        user.user_permissions.add(Permission.objects.get(content_type__app_label='negocio',codename='change_servicios'))
        client=APIClient()
        client.force_authenticate(user)
        response=client.patch(ADMIN+'servicios/'+str(service['id'])+'/',{'profesionales_ids':[self.second.pk]},format='json')
        self.assertEqual(response.status_code,403,response.data)
        with patch('apps.catalogo.services.audit',side_effect=RuntimeError('audit rollback')):
            with self.assertRaises(RuntimeError):
                self.patch('servicios',service['id'],{'profesionales_ids':[self.second.pk],'precio_base':'99'})
        self.assertTrue(m.ProfesionalServicios.objects.filter(servicio_id=service['id'],profesional_id=self.first.pk).exists())
        self.assertFalse(m.ProfesionalServicios.objects.filter(servicio_id=service['id'],profesional_id=self.second.pk).exists())
        self.assertEqual(str(m.Servicios.objects.get(pk=service['id']).precio_base),'80.10')
