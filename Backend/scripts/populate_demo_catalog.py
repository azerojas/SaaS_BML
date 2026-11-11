"""Explicit, repeatable LOCAL catalog demo. Run in Django shell with BEAUTY_ALLOW_LOCAL_DEMO=1.

No migrations, stock movements, clients, sales or payments. Existing rows are never overwritten.
"""
import json
import os
from django.contrib.auth import get_user_model
from django.db import connection, transaction
from apps.catalogo.entities import ENTITIES
from apps.catalogo.services import save_entity
from negocio import models as m

MARKER = 'CATÁLOGO DE DEMOSTRACIÓN. Precios de ejemplo, no representan una oferta comercial. '
SERVICES = [
    ('extensiones-clasicas', 'Extensiones clásicas 1 a 1', 'Pestañas', '95.00', 120,
     'Una mirada definida con un acabado ligero y natural. Aplicación individual pensada para realzar la forma de tus ojos.'),
    ('volumen-ligero', 'Extensiones de volumen ligero', 'Pestañas', '135.00', 150,
     'Un efecto suave y esponjoso para dar protagonismo a tu mirada. Diseño personalizado y acabado delicado.'),
    ('lifting-pestanas', 'Lifting de pestañas', 'Pestañas', '75.00', 60,
     'Realza la curvatura de tus pestañas naturales y disfruta de una mirada más abierta. Un detalle sencillo que transforma tu día.'),
    ('perfilado-cejas', 'Diseño y perfilado de cejas', 'Cejas', '25.00', 25,
     'Un diseño que acompaña tus facciones. Perfilado cuidadoso para dar forma, equilibrio y expresión a tu rostro.'),
    ('laminado-cejas', 'Laminado de cejas', 'Cejas', '55.00', 45,
     'Cejas con una apariencia peinada, definida y natural. Un acabado pensado para acompañar tu estilo.'),
    ('limpieza-facial', 'Limpieza facial esencial', 'Cuidado facial', '85.00', 60,
     'Una pausa para cuidar tu piel. Limpieza suave y una experiencia de bienestar para terminar con una sensación de frescura.'),
]
PRODUCTS = [
    ('espuma-limpiadora', 'Espuma limpiadora de pestañas', 'Cuidado en casa', '35.00',
     'Un complemento para tu rutina de limpieza y cuidado de pestañas. Presentación de ejemplo de 150 ml.'),
    ('cepillo-pestanas', 'Cepillo para pestañas', 'Accesorios', '8.00',
     'Un pequeño esencial para mantener tus pestañas peinadas. Formato de bolsillo, cómodo para tu neceser.'),
    ('serum-acondicionador', 'Sérum acondicionador de pestañas', 'Cuidado en casa', '45.00',
     'Un paso de cuidado para acompañar tu rutina diaria. Presentación de ejemplo de 10 ml; no se atribuyen resultados clínicos.'),
    ('kit-mirada', 'Kit de cuidado para la mirada', 'Cuidado en casa', '59.00',
     'Una selección de accesorios de ejemplo para tu rutina: espuma, cepillo y estuche. Un detalle para cuidarte en casa.'),
]


def populate():
    if os.environ.get('BEAUTY_ALLOW_LOCAL_DEMO') != '1' or connection.settings_dict['NAME'].casefold() != 'lasheo':
        raise RuntimeError('Explicit local Lasheo demo authorization required.')
    actor = get_user_model().objects.get(username='operador_local', is_active=True, is_staff=True)
    for model in ['categoriasservicio', 'categoriasarticulo', 'servicios', 'articulos']:
        if not actor.has_perm('negocio.add_' + model):
            raise PermissionError('The local operator lacks catalog creation permission.')
    created, existing = [], []

    def ensure(kind, data, **lookup):
        model, serializer_class, _ = ENTITIES[kind]
        found = model.objects.filter(**lookup).first()
        if found is not None:
            if kind in ('servicios', 'articulos') and not (found.descripcion or '').startswith(MARKER):
                raise RuntimeError('Demo slug belongs to another record; nothing will be overwritten.')
            existing.append({'kind': kind, 'id': found.pk})
            return found
        serializer = serializer_class(data=data)
        serializer.is_valid(raise_exception=True)
        result = save_entity(kind, serializer.validated_data, actor)
        created.append({'kind': kind, 'id': result.pk})
        return result

    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute('SELECT pg_advisory_xact_lock(718302452)')
        unit = m.UnidadesMedida.objects.filter(codigo__iexact='ud').first()
        if unit is None:
            unit = ensure('unidades', {'codigo': 'DEMO-UD', 'nombre': 'Unidad de demostración'}, codigo='DEMO-UD')
        for order, (slug, name, category, price, duration, description) in enumerate(SERVICES, 1):
            category_name = 'Demo · ' + category
            parent = ensure('categorias-servicio', {'nombre': category_name, 'activa': True, 'orden': order}, nombre=category_name)
            ensure('servicios', {'nombre': name, 'slug': 'demo-' + slug, 'categoria_id': parent.pk,
                'descripcion': MARKER + description, 'precio_base': price, 'duracion_minutos': duration,
                'activo': True, 'visible_catalogo': True, 'reservable_online': False,
                'requiere_anticipo': False, 'orden': order}, slug='demo-' + slug)
        for order, (slug, name, category, price, description) in enumerate(PRODUCTS, 1):
            category_name = 'Demo · ' + category
            parent = ensure('categorias-articulo', {'nombre': category_name}, nombre=category_name)
            ensure('articulos', {'nombre': name, 'slug': 'demo-' + slug, 'sku': 'DEMO-' + slug.upper(),
                'categoria_id': parent.pk, 'unidad_id': unit.pk, 'tipo': 'VENTA',
                'descripcion': MARKER + description, 'precio_venta': price, 'stock_minimo': '0.000',
                'activo': True, 'visible_catalogo': True, 'orden': order}, slug='demo-' + slug)
    return {'created': created, 'already_existing': existing,
            'demo_services': m.Servicios.objects.filter(slug__startswith='demo-').count(),
            'demo_products': m.Articulos.objects.filter(slug__startswith='demo-').count(),
            'stock_movements_created': 0, 'images_added': 0}


print(json.dumps(populate(), ensure_ascii=False))
