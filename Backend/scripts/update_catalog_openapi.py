"""Regenerate catalog contracts from their DTOs, preserving phase-1 endpoints."""
import copy
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()
from rest_framework import serializers as drf
from apps.catalogo import serializers as s
from apps.catalogo.entities import ENTITIES

path = ROOT / 'docs/openapi.json'
doc = json.loads(path.read_text(encoding='utf-8'))
schemas = doc['components']['schemas']
ref = lambda name: {'$ref': '#/components/schemas/' + name}


def map_field(name, field):
    if isinstance(field, (drf.ListSerializer, drf.ListField)):
        result = {'type': 'array', 'items': map_schema(field.child) if isinstance(field.child, drf.BaseSerializer) else map_field('', field.child)}
    elif isinstance(field, drf.BooleanField):
        result = {'type': 'boolean'}
    elif isinstance(field, drf.DecimalField):
        result = {'type': 'string', 'format': 'decimal', 'description': 'Decimal exacto: ' + str(field.max_digits) + ' digitos, ' + str(field.decimal_places) + ' decimales.'}
    elif isinstance(field, drf.IntegerField) or name == 'id' or name.endswith('_id'):
        result = {'type': 'integer', 'format': 'int64'}
    else:
        result = {'type': 'string'}
        if isinstance(field, drf.DateTimeField):
            result['format'] = 'date-time'
        elif isinstance(field, drf.DateField):
            result['format'] = 'date'
        elif isinstance(field, drf.URLField):
            result['format'] = 'uri'
    if hasattr(field, 'choices'):
        result['enum'] = list(field.choices)
    if getattr(field, 'allow_null', False) or name in ('categoria_nombre', 'categoria', 'imagen_principal'):
        result['nullable'] = True
    if field.read_only:
        result['readOnly'] = True
    for attr, key in [('max_length', 'maxLength'), ('min_length', 'minLength')]:
        value = getattr(field, attr, None)
        if value is not None:
            if result['type'] == 'array':
                key = 'maxItems' if attr == 'max_length' else 'minItems'
            result[key] = value
    if result['type'] == 'integer':
        for attr, key in [('min_value', 'minimum'), ('max_value', 'maximum')]:
            value = getattr(field, attr, None)
            if value is not None:
                result[key] = value
    return result


def map_schema(serializer):
    if isinstance(serializer, drf.ListSerializer):
        return {'type': 'array', 'items': map_schema(serializer.child)}
    fields = serializer.fields
    result = {'type': 'object', 'properties': {name: map_field(name, field) for name, field in fields.items()}}
    model = getattr(getattr(serializer, 'Meta', None), 'model', None)
    if model:
        for name, schema in result['properties'].items():
            if name.endswith('_id'):
                from django.core.exceptions import FieldDoesNotExist
                try:
                    relation = model._meta.get_field(name[:-3])
                except FieldDoesNotExist:
                    continue
                if relation.null:
                    schema['nullable'] = True
    required = [name for name, field in fields.items() if field.required]
    if required:
        result['required'] = required
    return result


def register(name, cls, input=False):
    schema = map_schema(cls())
    if input:
        schema['additionalProperties'] = False
    if name in ('ServicioPublico', 'ProductoPublico'):
        schema['properties']['moneda'] = {'type': 'string', 'enum': ['PEN']}
    schemas[name] = schema


for kind, (model, input_cls, output_cls) in ENTITIES.items():
    name = output_cls.__name__.removesuffix('Output')
    register(name, output_cls)
    register(name + 'Create', input_cls, input=True)
    patch_schema = copy.deepcopy(schemas[name + 'Create'])
    patch_schema.pop('required', None)
    schemas[name + 'Patch'] = patch_schema
for name, cls, input in [('Imagen', s.ImagenOutput, False), ('ImagenCreate', s.ImagenInput, True),
                         ('RecetaPut', s.RecetaInput, True), ('InsumoReceta', s.InsumoOutput, False),
                         ('ServicioPublico', s.ServicioPublicOutput, False),
                         ('ProductoPublico', s.ProductoPublicOutput, False), ('Stock', s.StockOutput, False)]:
    register(name, cls, input)
schemas['Receta'] = {'type': 'object', 'properties': {
    'servicio_id': {'type': 'integer', 'format': 'int64'},
    'insumos': {'type': 'array', 'items': ref('InsumoReceta')},
    'costo_estimado': {'type': 'string', 'nullable': True, 'description': 'Siempre null en fase 2; sin politica de costeo.'},
    'moneda': {'type': 'string', 'enum': ['PEN']}}}
schemas['CategoriaPublica'] = {'type': 'object', 'properties': {
    'id': {'type': 'integer', 'format': 'int64'}, 'nombre': {'type': 'string'},
    'tipo': {'type': 'string', 'enum': ['servicio', 'producto']}, 'orden': {'type': 'integer'}}}
csrf = {'name': 'X-CSRFToken', 'in': 'header', 'required': True, 'schema': {'type': 'string'}}
identity = {'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'integer', 'format': 'int64', 'minimum': 1}}
slug = {'name': 'slug', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}


def response(description, schema=None):
    result = {'description': description}
    if schema:
        result['content'] = {'application/json': {'schema': schema}}
    return result


def page(name):
    return {'type': 'object', 'required': ['count', 'next', 'previous', 'results'], 'properties': {
        'count': {'type': 'integer'}, 'next': {'type': 'string', 'nullable': True},
        'previous': {'type': 'string', 'nullable': True}, 'results': {'type': 'array', 'items': ref(name)}}}


def query(name, type='string', **schema):
    return {'name': name, 'in': 'query', 'schema': {'type': type, **schema}}


pagination = [query('page', 'integer', minimum=1, default=1), query('page_size', 'integer', minimum=1, maximum=100, default=20)]
common = [query('search', maxLength=200)] + pagination


def operation(id, summary, output=None, input=None, status='200', public=False, params=None, paginated=False):
    responses = {status: response('Correcto', page(output) if paginated else ref(output) if output else None),
                 '400': response('Validacion', ref('ValidationError')),
                 '404': response('No encontrado', ref('Error'))}
    if not public:
        responses['403'] = response('Sin autorizacion o CSRF', ref('Error'))
    if input or status == '204':
        responses['409'] = response('Conflicto de integridad o regla de negocio', ref('Error'))
    result = {'operationId': id, 'summary': summary, 'tags': ['catalogo-publico' if public else 'catalogo-admin'], 'responses': responses}
    if public:
        result['security'] = []
    if params:
        result['parameters'] = params
    if input:
        result['requestBody'] = {'required': True, 'content': {'application/json': {'schema': ref(input)}}}
    return result


for key in list(doc['paths']):
    if key.startswith(('/api/admin/catalogo/', '/api/catalogo/')):
        del doc['paths'][key]
for kind, (model, input_cls, output_cls) in ENTITIES.items():
    name = output_cls.__name__.removesuffix('Output')
    base = '/api/admin/catalogo/' + kind + '/'
    filters = list(common)
    if kind in ('categorias-servicio', 'servicios', 'articulos'):
        filters += [query('activo', enum=['true', 'false', 'all'])]
    if kind in ('servicios', 'articulos'):
        filters += [query('categoria', 'integer', minimum=1), query('visible_catalogo', enum=['true', 'false', 'all']), query('orden', 'integer', minimum=0)]
    if kind == 'articulos':
        filters += [query('tipo', enum=['INSUMO', 'VENTA', 'AMBOS'])]
    doc['paths'][base] = {
        'get': operation('catalogList' + name, 'Listar ' + kind, name, params=filters, paginated=True),
        'post': operation('catalogCreate' + name, 'Crear ' + kind, name, name + 'Create', status='201', params=[csrf])}
    doc['paths'][base + '{id}/'] = {'parameters': [identity],
        'get': operation('catalogGet' + name, 'Detalle ' + kind, name),
        'patch': operation('catalogPatch' + name, 'Editar ' + kind, name, name + 'Patch', params=[csrf])}
    if kind in ('categorias-servicio', 'servicios', 'articulos'):
        for action in ('desactivar', 'reactivar'):
            doc['paths'][base + '{id}/' + action + '/'] = {'parameters': [identity],
                'post': operation('catalog' + action.title() + name, action.title() + ' ' + kind, name, params=[csrf])}
    if kind in ('servicios', 'articulos'):
        doc['paths'][base + '{id}/imagenes/'] = {'parameters': [identity],
            'get': operation('catalogImages' + name, 'Listar referencias de imagen', 'Imagen', params=pagination, paginated=True),
            'post': operation('catalogAddImage' + name, 'Agregar URL HTTPS aprobada', 'Imagen', 'ImagenCreate', status='201', params=[csrf])}
doc['paths']['/api/admin/catalogo/servicios/{id}/receta/'] = {'parameters': [identity],
    'get': operation('catalogRecipe', 'Leer receta estimada sin costeo', 'Receta'),
    'put': operation('catalogReplaceRecipe', 'Reemplazar receta completa, incluso lista vacia', 'Receta', 'RecetaPut', params=[csrf])}
doc['paths']['/api/admin/catalogo/imagenes/{id}/principal/'] = {'parameters': [identity],
    'post': operation('catalogPrimaryImage', 'Cambiar principal dentro de su padre original', 'Imagen', params=[csrf])}
doc['paths']['/api/admin/catalogo/imagenes/{id}/'] = {'parameters': [identity],
    'delete': operation('catalogDeleteImage', 'Eliminar solo referencia; sustituir principal si queda otra', status='204', params=[csrf])}
doc['paths']['/api/admin/catalogo/stock/'] = {
    'get': operation('catalogStock', 'Stock orientativo de la vista, solo lectura', 'Stock', params=common + [query('tipo', enum=['INSUMO', 'VENTA', 'AMBOS']), query('articulo', 'integer', minimum=1)], paginated=True)}
for resource, name in [('servicios', 'ServicioPublico'), ('productos', 'ProductoPublico')]:
    base = '/api/catalogo/' + resource + '/'
    doc['paths'][base] = {'get': operation('publicList' + name, 'Catalogo publico de ' + resource, name, public=True, params=common + [query('categoria', 'integer', minimum=1), query('orden', 'integer', minimum=0)], paginated=True)}
    doc['paths'][base + '{slug}/'] = {'parameters': [slug], 'get': operation('publicGet' + name, 'Detalle publicado', name, public=True)}
doc['paths']['/api/catalogo/categorias/'] = {'get': operation('publicCatalogCategories', 'Categorias con contenido publicado; distinguir tipo', 'CategoriaPublica', public=True, params=common, paginated=True)}
if tuple(map(int, doc['info']['version'].split('.'))) < (1, 1, 0):
    doc['info']['version'] = '1.1.0'
phase3_suffix = ' Fase 3:' + doc['info']['description'].split(' Fase 3:', 1)[1] if ' Fase 3:' in doc['info']['description'] else ''
doc['info']['description'] = doc['info']['description'].split(' Fase 2:')[0] + ' Fase 2: catalogo privado y publico, recetas estimadas e imagenes por URL aprobada. No realiza compras, reservas ni movimientos de inventario.' + phase3_suffix
path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print('Catalog OpenAPI regenerated:', len(doc['paths']), 'total API paths.')

