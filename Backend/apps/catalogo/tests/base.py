from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from negocio import models as m

ADMIN = '/api/admin/catalogo/'
PUBLIC = '/api/catalogo/'


class CatalogTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_superuser('catalog_admin_test', password=None)
        cls.regular = get_user_model().objects.create_user('catalog_regular_test')
        cls.unit = m.UnidadesMedida.objects.create(codigo='ML', nombre='Mililitro')
        cls.other_unit = m.UnidadesMedida.objects.create(codigo='GR', nombre='Gramo')

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.sequence = 0

    def create(self, kind, **data):
        response = self.client.post(ADMIN + kind + '/', data, format='json')
        self.assertEqual(response.status_code, 201, getattr(response, 'data', response.content))
        return response.json()

    def service(self, **changes):
        self.sequence += 1
        return self.create('servicios', **{'nombre': 'Servicio ficticio ' + str(self.sequence), 'precio_base': '80.10', **changes})

    def article(self, **changes):
        self.sequence += 1
        return self.create('articulos', **{'nombre': 'Articulo ficticio ' + str(self.sequence),
            'unidad_id': self.unit.pk, 'tipo': 'INSUMO', **changes})

    def patch(self, kind, pk, data):
        return self.client.patch(ADMIN + kind + '/' + str(pk) + '/', data, format='json')

