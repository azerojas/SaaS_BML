from django.db import IntegrityError, transaction
from django.test import override_settings
from negocio import models as m
from .base import CatalogTestCase, ADMIN, PUBLIC


@override_settings(CATALOG_IMAGE_ALLOWED_HOSTS=['images.example.com'])
class ImageTests(CatalogTestCase):
    def test_edit_metadata_preserves_destination_and_primary_and_rejects_reassignment(self):
        service=self.service()
        image=self.add('servicios',service['id'])
        path=ADMIN+'imagenes/'+str(image['id'])+'/'
        response=self.client.patch(path,{'texto_alt':'Detalle actualizado','orden':3},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.json()['servicio_id'],service['id'])
        self.assertTrue(response.json()['es_principal'])
        self.assertEqual(response.json()['texto_alt'],'Detalle actualizado')
        self.assertEqual(response.json()['orden'],3)
        self.assertEqual(self.client.patch(path,{'articulo_id':1},format='json').status_code,400)
        self.assertEqual(self.client.patch(path,{'es_principal':False},format='json').status_code,400)
        self.assertEqual(self.client.patch(path,{'url':'https://unapproved.example/x'},format='json').status_code,400)
        from django.contrib.auth import get_user_model
        staff=get_user_model().objects.create_user('image_readonly_staff',is_staff=True)
        self.client.force_authenticate(staff)
        self.assertEqual(self.client.patch(path,{'texto_alt':'No permitido'},format='json').status_code,403)

    def add(self, kind, pk, **changes):
        r=self.client.post(ADMIN+kind+'/'+str(pk)+'/imagenes/',{'url':'https://images.example.com/test.jpg',**changes},format='json')
        self.assertEqual(r.status_code,201,r.data)
        return r.json()

    def test_multiple_images_and_single_primary(self):
        service=self.service(visible_catalogo=True)
        a=self.add('servicios',service['id'],texto_alt='Foto ficticia')
        b=self.add('servicios',service['id'],url='https://images.example.com/second.jpg',es_principal=True)
        self.assertTrue(a['es_principal'])
        self.assertEqual(m.ImagenesCatalogo.objects.filter(servicio_id=service['id']).count(),2)
        self.assertEqual(m.ImagenesCatalogo.objects.filter(servicio_id=service['id'],es_principal=True).get().pk,b['id'])
        self.assertEqual(self.client.post(ADMIN+'imagenes/'+str(a['id'])+'/principal/').status_code,200)
        self.assertEqual(m.ImagenesCatalogo.objects.filter(servicio_id=service['id'],es_principal=True).get().pk,a['id'])
        self.assertEqual(self.client.get(ADMIN+'servicios/'+str(service['id'])+'/imagenes/').json()['count'],2)
        self.assertEqual(self.client.get(PUBLIC+'servicios/'+service['slug']+'/').json()['imagen_principal'],a['url'])

    def test_delete_reference_reassigns_primary_and_preserves_parent(self):
        service=self.service()
        a=self.add('servicios',service['id'])
        b=self.add('servicios',service['id'])
        self.assertEqual(self.client.delete(ADMIN+'imagenes/'+str(a['id'])+'/').status_code,204)
        self.assertTrue(m.ImagenesCatalogo.objects.get(pk=b['id']).es_principal)
        self.assertTrue(m.Servicios.objects.filter(pk=service['id']).exists())
        self.assertEqual(self.client.delete(ADMIN+'imagenes/'+str(b['id'])+'/').status_code,204)
        self.assertFalse(m.ImagenesCatalogo.objects.filter(servicio_id=service['id']).exists())

    def test_invalid_urls_hosts_and_destinations(self):
        service=self.service()
        path=ADMIN+'servicios/'+str(service['id'])+'/imagenes/'
        for url in ['http://images.example.com/x.jpg','https://evil.example.com/x.jpg','https://images.example.com.evil.test/x',
                    'https://images.example.com@127.0.0.1/a','https://127.0.0.1/a','https://localhost/a',
                    'https://images.example.com:444/x','https://images.example.com/x#bad','javascript:alert(1)']:
            self.assertEqual(self.client.post(path,{'url':url},format='json').status_code,400)
        self.assertEqual(self.client.post(path,{'url':'https://images.example.com/x','articulo_id':1},format='json').status_code,400)
        self.assertEqual(self.client.post(path,{'url':'https://images.example.com/x','texto_alt':'x'*201},format='json').status_code,400)
        a=self.add('servicios',service['id'])
        self.assertEqual(self.client.post(ADMIN+'imagenes/'+str(a['id'])+'/principal/',{'articulo_id':1},format='json').status_code,400)

    @override_settings(CATALOG_IMAGE_ALLOWED_HOSTS=[])
    def test_no_approved_hosts_blocks_image_creation(self):
        service=self.service()
        r=self.client.post(ADMIN+'servicios/'+str(service['id'])+'/imagenes/',{'url':'https://images.example.com/x'},format='json')
        self.assertEqual(r.status_code,400)

    def test_public_suppresses_legacy_unapproved_url(self):
        service=self.service(visible_catalogo=True)
        m.ImagenesCatalogo.objects.create(servicio_id=service['id'],url='http://127.0.0.1/private',es_principal=True)
        self.assertIsNone(self.client.get(PUBLIC+'servicios/'+service['slug']+'/').json()['imagen_principal'])

    def test_sql_destination_check_and_partial_unique_index(self):
        service=self.service()
        article=self.article()
        with self.assertRaises(IntegrityError),transaction.atomic():
            m.ImagenesCatalogo.objects.create(servicio_id=service['id'],articulo_id=article['id'],url='https://images.example.com/x')
        with self.assertRaises(IntegrityError),transaction.atomic():
            m.ImagenesCatalogo.objects.create(url='https://images.example.com/x')
        self.add('servicios',service['id'])
        with self.assertRaises(IntegrityError),transaction.atomic():
            m.ImagenesCatalogo.objects.create(servicio_id=service['id'],url='https://images.example.com/x',es_principal=True)

