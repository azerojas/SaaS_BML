from decimal import Decimal
from unittest.mock import patch
from django.db import IntegrityError, transaction
from negocio import models as m
from .base import CatalogTestCase, ADMIN, PUBLIC


class ServiceTests(CatalogTestCase):
    def test_create_list_detail_patch_and_defaults(self):
        data = self.service(nombre='  Pestañas   clásicas ')
        self.assertEqual(data['nombre'], 'Pestañas clásicas')
        self.assertEqual(data['precio_base'], '80.10')
        self.assertEqual(data['slug'], 'pestanas-clasicas')
        self.assertFalse(data['visible_catalogo'])
        self.assertTrue(data['activo'])
        obj = m.Servicios.objects.get(pk=data['id'])
        self.assertEqual(obj.precio_base, Decimal('80.10'))
        self.assertIsNotNone(obj.creado_en)
        self.assertEqual(self.client.get(ADMIN + 'servicios/').json()['count'], 1)
        path = ADMIN + 'servicios/' + str(obj.pk) + '/'
        self.assertEqual(self.client.get(path).status_code, 200)
        response = self.patch('servicios', obj.pk, {'nombre': 'Otro nombre', 'precio_base': '0.00'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['slug'], data['slug'])
        self.assertEqual(response.json()['precio_base'], '0.00')

    def test_service_validation(self):
        for field, value in [('nombre', ' '), ('nombre', 'x' * 151), ('precio_base', '-0.01'),
                             ('precio_base', '1.001'), ('duracion_minutos', 0), ('duracion_minutos', -1),
                             ('categoria_id', 999999), ('orden', -1), ('slug', 'no slug')]:
            with self.subTest(field=field, value=value):
                r = self.client.post(ADMIN + 'servicios/', {'nombre': 'Prueba', 'precio_base': '1.00', field: value}, format='json')
                self.assertEqual(r.status_code, 400)
        r = self.client.post(ADMIN + 'servicios/', {'nombre': 'Prueba', 'precio_base': '1.00', 'reservable_online': True}, format='json')
        self.assertEqual(r.status_code, 400)
        obj = self.service(reservable_online=True, duracion_minutos=30)
        self.assertEqual(self.patch('servicios', obj['id'], {'duracion_minutos': None}).status_code, 400)

    def test_duplicates_slug_stability_and_controlled_unique_error(self):
        first = self.service(nombre='Extensiones!', slug='extensiones')
        response = self.client.post(ADMIN + 'servicios/', {'nombre': 'extensiones!', 'precio_base': '1'}, format='json')
        self.assertEqual(response.status_code, 409)
        second = self.service(nombre='Extensiones?')
        self.assertEqual(second['slug'], 'extensiones-2')
        self.assertEqual(self.patch('servicios', second['id'], {'slug': 'renombrado'}).status_code, 409)
        response = self.client.post(ADMIN + 'servicios/', {'nombre': 'Otro', 'precio_base': '1', 'slug': first['slug']}, format='json')
        self.assertEqual(response.status_code, 409)
        with patch('apps.catalogo.services.unique_value'):
            response = self.client.post(ADMIN + 'servicios/', {'nombre': first['nombre'], 'precio_base': '1'}, format='json')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(m.Servicios.objects.count(), 2)

    def test_publication_requires_active_and_soft_delete(self):
        response = self.client.post(ADMIN + 'servicios/', {'nombre': 'No activo', 'precio_base': '1', 'activo': False, 'visible_catalogo': True}, format='json')
        self.assertEqual(response.status_code, 400)
        data = self.service(visible_catalogo=True)
        path = ADMIN + 'servicios/' + str(data['id']) + '/'
        for _ in range(2):
            self.assertEqual(self.client.post(path + 'desactivar/').status_code, 200)
        obj = m.Servicios.objects.get(pk=data['id'])
        self.assertFalse(obj.activo)
        self.assertFalse(obj.visible_catalogo)
        self.assertEqual(m.Auditoria.objects.filter(entidad='servicios', accion='DESACTIVAR').count(), 1)
        self.assertEqual(self.client.post(path + 'reactivar/').status_code, 200)
        obj.refresh_from_db()
        self.assertTrue(obj.activo)
        self.assertFalse(obj.visible_catalogo)
        self.assertEqual(self.client.delete(path).status_code, 405)
        self.assertEqual(self.client.put(path, {}, format='json').status_code, 405)

    def test_categories_and_filters(self):
        category = self.create('categorias-servicio', nombre='  Ojos  ', orden=2)
        self.assertTrue(category['activa'])
        self.service(nombre='Pestañas', categoria_id=category['id'], orden=10)
        first = self.service(nombre='Alfa', orden=1)
        response = self.client.get(ADMIN + 'servicios/', {'page_size': 1}).json()
        self.assertEqual(response['results'][0]['id'], first['id'])
        self.assertIsNotNone(response['next'])
        for params in [{'categoria': category['id']}, {'search': ' pestanas '}, {'orden': 10}]:
            self.assertEqual(self.client.get(ADMIN + 'servicios/', params).json()['count'], 1)
        for params in [{'categoria': 'bad'}, {'activo': 'bad'}, {'ordering': 'precio_base'}, {'page_size': 0}]:
            self.assertEqual(self.client.get(ADMIN + 'servicios/', params).status_code, 400)
        self.assertEqual(self.client.post(ADMIN + 'categorias-servicio/' + str(category['id']) + '/desactivar/').status_code, 200)
        self.assertEqual(self.client.post(ADMIN + 'categorias-servicio/' + str(category['id']) + '/reactivar/').status_code, 200)

    def test_unknown_fields_and_sql_checks(self):
        self.assertEqual(self.client.post(ADMIN + 'servicios/', {'nombre':'X', 'precio_base':'1', 'creado_en':'x'}, format='json').status_code, 400)
        obj = self.service()
        with self.assertRaises(IntegrityError), transaction.atomic():
            m.Servicios.objects.filter(pk=obj['id']).update(reservable_online=True, duracion_minutos=None)
        with self.assertRaises(IntegrityError), transaction.atomic():
            m.Servicios.objects.filter(pk=obj['id']).update(precio_base=-1)

