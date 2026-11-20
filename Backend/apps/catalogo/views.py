from apps.operaciones.presentation.permissions import LegacyModelPermission
from django.shortcuts import get_object_or_404
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied
from django.http import HttpResponse
from django.db.models import Q
from apps.operaciones.presentation.parsers import BoundedJSONParser
from negocio import models as m
from . import selectors, services
from .entities import ENTITIES
from .pagination import CatalogPagination
from .serializers import ImagenInput, ImagenEditInput, ImagenOutput, RecetaInput, ServicioPublicOutput, ProductoPublicOutput, StockOutput


class EntityViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [LegacyModelPermission]
    pagination_class = CatalogPagination
    http_method_names = ['get', 'post', 'patch', 'head', 'options']
    kind = None
    lookup_value_regex = '[0-9]+'

    def get_queryset(self):
        return selectors.admin_list(self.kind, self.request.query_params if self.action == 'list' else {})

    def get_serializer_class(self):
        return ENTITIES[self.kind][2]

    def create(self, request):
        serializer = ENTITIES[self.kind][1](data=request.data)
        serializer.is_valid(raise_exception=True)
        obj = services.save_entity(self.kind, serializer.validated_data, request.user)
        return Response(self.get_serializer(obj).data, status=201)

    def partial_update(self, request, pk=None):
        obj = self.get_object()
        serializer = ENTITIES[self.kind][1](data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        obj = services.save_entity(self.kind, serializer.validated_data, request.user, obj.pk)
        return Response(self.get_serializer(obj).data)


class ActiveEntityViewSet(EntityViewSet):
    @action(detail=True, methods=['post'])
    def desactivar(self, request, pk=None):
        obj = services.set_active(self.kind, self.get_object().pk, False, request.user)
        return Response(self.get_serializer(obj).data)

    @action(detail=True, methods=['post'])
    def reactivar(self, request, pk=None):
        obj = services.set_active(self.kind, self.get_object().pk, True, request.user)
        return Response(self.get_serializer(obj).data)


class CategoriaServicioViewSet(ActiveEntityViewSet):
    kind = 'categorias-servicio'


class CategoriaArticuloViewSet(EntityViewSet):
    kind = 'categorias-articulo'


class UnidadViewSet(EntityViewSet):
    kind = 'unidades'


class ImageParentViewSet(ActiveEntityViewSet):
    @action(detail=True, methods=['get', 'post'])
    def imagenes(self, request, pk=None):
        parent = self.get_object()
        if request.method == 'POST':
            serializer = ImagenInput(data=request.data)
            serializer.is_valid(raise_exception=True)
            obj = services.add_image(self.kind, parent.pk, serializer.validated_data, request.user)
            return Response(ImagenOutput(obj).data, status=201)
        rows = services.image_rows(self.kind, parent.pk)
        page = self.paginate_queryset(rows)
        return self.get_paginated_response(ImagenOutput(page, many=True).data)


class ServicioViewSet(ImageParentViewSet):
    kind = 'servicios'
    http_method_names = ImageParentViewSet.http_method_names + ['put']
    parser_classes = [BoundedJSONParser, MultiPartParser]

    def photo_response(self, request, pk=None):
        from .photos import multipart_photo, save_with_photo
        if not request.user.has_perm('negocio.add_imagenescatalogo'):
            raise PermissionDenied('No tienes permiso para añadir fotografías.')
        data, photo = multipart_photo(request)
        serializer = ENTITIES[self.kind][1](data=data, partial=pk is not None)
        serializer.is_valid(raise_exception=True)
        obj = save_with_photo(serializer.validated_data, photo, request.user, pk)
        return Response(self.get_serializer(obj).data, status=200 if pk is not None else 201)

    def create(self, request):
        if request.content_type.split(';', 1)[0].strip().lower() == 'multipart/form-data':
            return self.photo_response(request)
        return super().create(request)

    def partial_update(self, request, pk=None):
        if request.content_type.split(';', 1)[0].strip().lower() == 'multipart/form-data':
            return self.photo_response(request, self.get_object().pk)
        return super().partial_update(request, pk)

    @action(detail=True, methods=['get', 'put'])
    def receta(self, request, pk=None):
        parent = self.get_object()
        if request.method == 'PUT':
            serializer = RecetaInput(data=request.data)
            serializer.is_valid(raise_exception=True)
            return Response(services.replace_recipe(parent.pk, serializer.validated_data, request.user))
        return Response(services.read_recipe(parent.pk))


class ArticuloViewSet(ImageParentViewSet):
    kind = 'articulos'


class UploadedPhotoView(APIView):
    permission_classes = [AllowAny]
    http_method_names = ['get', 'head', 'options']

    def get(self, request, photo_id):
        from .models import UploadedPhoto
        from uuid import UUID
        from rest_framework.exceptions import NotFound
        url = '/api/catalogo/fotos/' + photo_id + '.jpg'
        references = m.ImagenesCatalogo.objects.filter(url=url)
        public = (Q(servicio__activo=True, servicio__visible_catalogo=True)
                  & (Q(servicio__categoria__isnull=True) | Q(servicio__categoria__activa=True)))
        public |= Q(articulo__activo=True, articulo__visible_catalogo=True,
                    articulo__tipo__in=['VENTA', 'AMBOS'])
        allowed = references.filter(public).exists()
        if not allowed and request.user.is_authenticated and request.user.is_staff and request.user.is_active:
            allowed = ((request.user.has_perm('negocio.view_servicios')
                        and references.filter(servicio_id__isnull=False).exists())
                       or (request.user.has_perm('negocio.view_articulos')
                           and references.filter(articulo_id__isnull=False).exists()))
        if not allowed:
            raise NotFound()
        photo = get_object_or_404(UploadedPhoto, pk=UUID(photo_id))
        response = HttpResponse(bytes(photo.content), content_type='image/jpeg')
        response['Content-Disposition'] = 'inline; filename="foto-catalogo.jpg"'
        return response


class ImagenViewSet(viewsets.GenericViewSet):
    serializer_class = ImagenOutput
    permission_classes = [LegacyModelPermission]
    http_method_names = ['post', 'patch', 'delete', 'options']
    lookup_value_regex = '[0-9]+'

    @action(detail=True, methods=['post'])
    def principal(self, request, pk=None):
        if request.data:
            raise ValidationError('Esta accion no acepta reasignacion de destino ni otros campos.')
        return Response(ImagenOutput(services.set_primary_image(pk, request.user)).data)

    def destroy(self, request, pk=None):
        services.delete_image(pk, request.user)
        return Response(status=204)

    def partial_update(self, request, pk=None):
        serializer = ImagenEditInput(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return Response(ImagenOutput(services.update_image(pk, serializer.validated_data, request.user)).data)


class StockViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [LegacyModelPermission]
    pagination_class = CatalogPagination
    serializer_class = StockOutput
    http_method_names = ['get', 'head', 'options']

    def get_queryset(self):
        return selectors.stock_list(self.request.query_params)


class PublicCatalogViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [AllowAny]
    authentication_classes = []
    pagination_class = CatalogPagination
    http_method_names = ['get', 'head', 'options']
    lookup_field = 'slug'
    lookup_value_regex = '[a-zA-Z0-9_-]+'
    product = False

    def get_queryset(self):
        params = self.request.query_params if self.action == 'list' else {}
        return selectors.public_products(params) if self.product else selectors.public_services(params)

    def get_serializer_class(self):
        return ProductoPublicOutput if self.product else ServicioPublicOutput


class PublicProductViewSet(PublicCatalogViewSet):
    product = True


class PublicCategoryViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [AllowAny]
    authentication_classes = []
    pagination_class = CatalogPagination
    http_method_names = ['get', 'head', 'options']

    def list(self, request):
        service_ids = selectors.public_services({}).values('id')
        product_ids = selectors.public_products({}).values('id')
        service_categories = m.CategoriasServicio.objects.filter(activa=True,
            pk__in=m.Servicios.objects.filter(pk__in=service_ids).values('categoria_id')).order_by('orden', 'nombre', 'id')
        product_categories = m.CategoriasArticulo.objects.filter(
            pk__in=m.Articulos.objects.filter(pk__in=product_ids).values('categoria_id')).order_by('nombre', 'id')
        service_categories = selectors.search(service_categories, request.query_params, ['nombre'])
        product_categories = selectors.search(product_categories, request.query_params, ['nombre'])
        data = [dict(id=x.pk, tipo='servicio', nombre=x.nombre, orden=x.orden) for x in service_categories]
        data += [dict(id=x.pk, tipo='producto', nombre=x.nombre, orden=0) for x in product_categories]
        data.sort(key=lambda x: (x['orden'], x['nombre'], x['tipo'], x['id']))
        return self.get_paginated_response(self.paginate_queryset(data))

