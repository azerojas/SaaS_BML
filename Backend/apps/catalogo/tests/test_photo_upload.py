from io import BytesIO
import json
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient
from apps.catalogo.models import UploadedPhoto
from negocio import models as m
from .base import ADMIN, PUBLIC, CatalogTestCase


def photo(color='red', size=(32, 24)):
    output = BytesIO()
    image = Image.new('RGB', size, color)
    exif = Image.Exif()
    exif[315] = 'PRIVATE TEST METADATA'
    image.save(output, format='JPEG', exif=exif)
    return SimpleUploadedFile('foto.jpg', output.getvalue(), content_type='image/jpeg')


class PhotoUploadTests(CatalogTestCase):
    def upload(self, changes=None, file=None, pk=None):
        path = ADMIN + 'servicios/' + (str(pk) + '/' if pk else '')
        payload = {'nombre': 'Tratamiento con foto', 'precio_base': '25.50',
                   'visible_catalogo': True, **(changes or {})}
        return getattr(self.client, 'patch' if pk else 'post')(
            path, {'datos': json.dumps(payload), 'foto': file or photo()}, format='multipart')

    def test_create_photo_and_treatment_are_saved_together_and_public_photo_is_jpeg(self):
        response = self.upload()
        self.assertEqual(response.status_code, 201, response.data)
        data = response.json()
        url = data['imagen_principal']
        self.assertRegex(url, r'^/api/catalogo/fotos/[0-9a-f]{32}\.jpg$')
        self.assertEqual(UploadedPhoto.objects.count(), 1)
        self.assertEqual(m.ImagenesCatalogo.objects.get().servicio_id, data['id'])
        public = APIClient()
        image_response = public.get(url)
        self.assertEqual(image_response.status_code, 200)
        self.assertEqual(image_response['Content-Type'], 'image/jpeg')
        with Image.open(BytesIO(image_response.content)) as image:
            self.assertEqual(image.format, 'JPEG')
            self.assertFalse(image.getexif())
        self.assertEqual(public.get(PUBLIC + 'servicios/' + data['slug'] + '/').json()['imagen_principal'], url)

    def test_replacement_preserves_treatment_and_gallery_with_one_primary(self):
        original = self.upload().json()
        updated = self.upload({'precio_base': '30.25'}, file=photo('blue'), pk=original['id'])
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(updated.json()['id'], original['id'])
        self.assertNotEqual(updated.json()['imagen_principal'], original['imagen_principal'])
        self.assertEqual(m.Servicios.objects.count(), 1)
        self.assertEqual(UploadedPhoto.objects.count(), 2)
        self.assertEqual(m.ImagenesCatalogo.objects.filter(es_principal=True).count(), 1)
        plain = self.client.patch(ADMIN + 'servicios/' + str(original['id']) + '/',
                                  {'precio_base': '35.00'}, format='json')
        self.assertEqual(plain.json()['imagen_principal'], updated.json()['imagen_principal'])

    def test_private_and_retired_images_are_not_public(self):
        record = self.upload({'visible_catalogo': False}).json()
        public = APIClient()
        self.assertEqual(public.get(record['imagen_principal']).status_code, 404)
        self.assertEqual(self.client.get(record['imagen_principal']).status_code, 200)
        self.client.patch(ADMIN + 'servicios/' + str(record['id']) + '/', {'visible_catalogo': True}, format='json')
        self.assertEqual(public.get(record['imagen_principal']).status_code, 200)
        self.client.post(ADMIN + 'servicios/' + str(record['id']) + '/desactivar/', {}, format='json')
        self.assertEqual(public.get(record['imagen_principal']).status_code, 404)

    def test_corrupt_svg_oversized_and_huge_dimension_images_leave_no_records(self):
        for file in [SimpleUploadedFile('fake.jpg', b'not an image', content_type='image/jpeg'),
                     SimpleUploadedFile('svg.png', b'<svg onload="alert(1)"/>', content_type='image/png'),
                     SimpleUploadedFile('big.jpg', b'x' * (5 * 1024 * 1024 + 1), content_type='image/jpeg'),
                     photo(size=(5000, 4100))]:
            response = self.upload(file=file)
            self.assertEqual(response.status_code, 400, getattr(response, 'data', None))
            self.assertFalse(m.Servicios.objects.exists())
            self.assertFalse(UploadedPhoto.objects.exists())

    def test_invalid_treatment_and_database_error_roll_back_both_parts(self):
        self.assertEqual(self.upload({'precio_base': '-1'}).status_code, 400)
        self.assertFalse(UploadedPhoto.objects.exists())
        with patch('apps.catalogo.services.add_image', side_effect=RuntimeError('synthetic')):
            with self.assertRaises(RuntimeError):
                self.upload()
        self.assertFalse(m.Servicios.objects.exists())
        self.assertFalse(m.ImagenesCatalogo.objects.exists())
        self.assertFalse(UploadedPhoto.objects.exists())

    def test_parent_write_permission_does_not_grant_image_upload_permission(self):
        user = get_user_model().objects.create_user('catalog-photo-restricted', is_staff=True)
        user.user_permissions.add(*Permission.objects.filter(content_type__app_label='negocio',
                                  codename__in=['view_servicios', 'add_servicios', 'change_servicios']))
        self.client.force_authenticate(user)
        self.assertEqual(self.upload().status_code, 403)
        self.assertFalse(m.Servicios.objects.exists())
        response = self.client.post(ADMIN + 'servicios/', {'nombre': 'Sin foto', 'precio_base': '10.00'}, format='json')
        self.assertEqual(response.status_code, 201)

    def test_photo_limit_does_not_raise_other_request_limits(self):
        response = self.client.post(ADMIN + 'categorias-servicio/',
                                   b'x' * 70000, content_type='application/json')
        self.assertEqual(response.status_code, 413)

    def test_large_image_is_reduced_before_storage(self):
        response = self.upload(file=photo(size=(2000, 1500)))
        self.assertEqual(response.status_code, 201, response.data)
        with Image.open(BytesIO(bytes(UploadedPhoto.objects.get().content))) as image:
            self.assertEqual(image.size, (1600, 1200))
