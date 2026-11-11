"""Attach licensed reference photos to explicitly authorized local demo records only."""
import json
import os
from django.contrib.auth import get_user_model
from django.db import connection, transaction
from apps.catalogo.serializers import ImagenInput
from apps.catalogo.services import add_image
from negocio import models as m

# Pexels photo IDs; source pages/photographers are recorded in docs/catalog-demo-images.md.
PHOTOS = [
    ('servicios', 'demo-extensiones-clasicas', 7446922, 'Fotografía referencial de aplicación de extensiones clásicas'),
    ('servicios', 'demo-volumen-ligero', 5128233, 'Fotografía referencial de trabajo profesional sobre las pestañas'),
    ('servicios', 'demo-lifting-pestanas', 8558246, 'Fotografía referencial de cuidado de pestañas y cejas'),
    ('servicios', 'demo-perfilado-cejas', 5178009, 'Fotografía referencial de perfilado de cejas con pinza'),
    ('servicios', 'demo-laminado-cejas', 8558247, 'Fotografía referencial de peinado y cuidado de cejas'),
    ('servicios', 'demo-limpieza-facial', 5659049, 'Fotografía referencial de una sesión de cuidado facial'),
    ('articulos', 'demo-espuma-limpiadora', 2587177, 'Fotografía referencial de un envase de espuma limpiadora'),
    ('articulos', 'demo-cepillo-pestanas', 5128120, 'Fotografía referencial de cepillo y herramientas para pestañas'),
    ('articulos', 'demo-serum-acondicionador', 30229017, 'Fotografía referencial de sérum con gotero'),
    ('articulos', 'demo-kit-mirada', 16378440, 'Fotografía referencial de un conjunto de productos de limpieza y cuidado'),
]


def populate():
    if os.environ.get('BEAUTY_ALLOW_LOCAL_DEMO') != '1' or connection.settings_dict['NAME'].casefold() != 'lasheo':
        raise RuntimeError('Explicit local demo authorization required.')
    actor = get_user_model().objects.get(username='operador_local', is_staff=True, is_active=True)
    for permission in ['negocio.add_imagenescatalogo', 'negocio.change_servicios', 'negocio.change_articulos']:
        if not actor.has_perm(permission):
            raise PermissionError('Image creation permission required.')
    created, existing = [], []
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute('SELECT pg_advisory_xact_lock(718302452)')
        for kind, slug, photo_id, alt in PHOTOS:
            model = m.Servicios if kind == 'servicios' else m.Articulos
            parent = model.objects.get(slug=slug)
            if not (parent.descripcion or '').startswith('CATÁLOGO DE DEMOSTRACIÓN.'):
                raise RuntimeError('Not a demo record; refuse adding a photo.')
            owner = {'servicio_id' if kind == 'servicios' else 'articulo_id': parent.pk}
            url = f'https://images.pexels.com/photos/{photo_id}/pexels-photo-{photo_id}.jpeg?auto=compress&cs=tinysrgb&w=1000&h=750&fit=crop'
            found = m.ImagenesCatalogo.objects.filter(**owner, url=url).first()
            if found:
                existing.append(found.pk)
                continue
            serializer = ImagenInput(data={'url': url, 'texto_alt': alt, 'orden': 0})
            serializer.is_valid(raise_exception=True)
            # Preserve any existing primary chosen by the user; service selects one if absent.
            image = add_image(kind, parent.pk, serializer.validated_data, actor)
            created.append({'id': image.pk, 'slug': slug, 'photo_id': photo_id})
    return {'created': created, 'existing': existing, 'references': len(PHOTOS)}


print(json.dumps(populate(), ensure_ascii=False))
