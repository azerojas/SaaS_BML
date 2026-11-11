from apps.operaciones.presentation.permissions import LegacyModelPermission
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from apps.catalogo.pagination import CatalogPagination
from negocio import models as m
from .serializers import (ProveedorInput, ProveedorOutput, CompraInput, CompraListOutput,
    CompraOutput, AjusteInput, MovimientoOutput, InventarioStockOutput, VencimientoOutput, RecipeUseOutput)
from apps.inventario import selectors, services


def empty_body(request):
    if request.data:
        raise ValidationError('Esta accion no acepta campos; el servidor calcula su resultado.')


class PrivateViewSet(viewsets.GenericViewSet):
    permission_classes = [LegacyModelPermission]
    pagination_class = CatalogPagination
    lookup_value_regex = '[0-9]+'


class ProveedorViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, PrivateViewSet):
    serializer_class = ProveedorOutput
    http_method_names = ['get', 'post', 'patch', 'head', 'options']
    def get_queryset(self):
        return selectors.providers(self.request.query_params if self.action == 'list' else {})
    def create(self, request):
        serializer = ProveedorInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(ProveedorOutput(services.save_provider(serializer.validated_data, request.user)).data, status=201)
    def partial_update(self, request, pk=None):
        obj = self.get_object()
        serializer = ProveedorInput(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return Response(ProveedorOutput(services.save_provider(serializer.validated_data, request.user, obj.pk)).data)
    @action(detail=True, methods=['post'])
    def desactivar(self, request, pk=None):
        empty_body(request)
        return Response(ProveedorOutput(services.set_provider_active(self.get_object().pk, False, request.user)).data)
    @action(detail=True, methods=['post'])
    def reactivar(self, request, pk=None):
        empty_body(request)
        return Response(ProveedorOutput(services.set_provider_active(self.get_object().pk, True, request.user)).data)


class CompraViewSet(mixins.ListModelMixin, PrivateViewSet):
    http_method_names = ['get', 'post', 'patch', 'head', 'options']
    def get_queryset(self):
        return selectors.purchases(self.request.query_params if self.action == 'list' else {})
    def get_serializer_class(self):
        return CompraListOutput if self.action == 'list' else CompraOutput
    def retrieve(self, request, pk=None):
        return Response(CompraOutput(selectors.purchase_detail(pk)).data)
    def create(self, request):
        serializer = CompraInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        if request.headers.get('Idempotency-Key') is not None:
            obj, created = services.create_purchase_idempotent(serializer.validated_data, request.user, request.headers.get('Idempotency-Key'))
            return Response(CompraOutput(obj).data, status=201 if created else 200)
        return Response(CompraOutput(services.save_purchase(serializer.validated_data, request.user)).data, status=201)
    def partial_update(self, request, pk=None):
        obj = self.get_object()
        serializer = CompraInput(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return Response(CompraOutput(services.save_purchase(serializer.validated_data, request.user, obj.pk)).data)
    @action(detail=False, methods=['get'], url_path='estado-intento')
    def estado_intento(self, request):
        key = services.normalize_idempotency_key(request.query_params.get('clave'))
        previous = m.Auditoria.objects.filter(usuario_id=request.user.pk, entidad='compras',
            accion='CREAR_IDEMPOTENTE', datos__idempotency_key=key).first()
        return Response({'encontrada':bool(previous), 'compra':CompraOutput(selectors.purchase_detail(previous.datos['compra_id'])).data if previous else None})
    @action(detail=True, methods=['post'])
    def recibir(self, request, pk=None):
        empty_body(request)
        return Response(CompraOutput(services.receive_purchase(self.get_object().pk, request.user)).data)
    @action(detail=True, methods=['post'])
    def anular(self, request, pk=None):
        empty_body(request)
        return Response(CompraOutput(services.cancel_purchase(self.get_object().pk, request.user)).data)


class StockViewSet(mixins.ListModelMixin, PrivateViewSet):
    serializer_class = InventarioStockOutput
    http_method_names = ['get', 'head', 'options']
    def get_queryset(self):
        return selectors.stock(self.request.query_params)

    @action(detail=False, methods=['get'])
    def resumen(self, request):
        result = selectors.stock_summary()
        result['ultimos_movimientos'] = MovimientoOutput(selectors.movements({}).order_by('-fecha','-id')[:5],many=True).data if request.user.has_perm('negocio.view_movimientosinventario') else None
        return Response(result)

    @action(detail=False, methods=['get'], url_path='usos-receta')
    def usos_receta(self, request):
        if not request.user.has_perm('negocio.view_servicios'):
            raise PermissionDenied('Requiere permiso para consultar servicios.')
        page = self.paginate_queryset(selectors.recipe_uses(request.query_params))
        return self.get_paginated_response(RecipeUseOutput(page,many=True).data)


class MovimientoViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, PrivateViewSet):
    serializer_class = MovimientoOutput
    http_method_names = ['get', 'head', 'options']
    def get_queryset(self):
        return selectors.movements(self.request.query_params if self.action == 'list' else {})


class AjusteViewSet(PrivateViewSet):
    serializer_class = AjusteInput
    http_method_names = ['get', 'post', 'options']
    @action(detail=False, methods=['get'])
    def estado(self, request):
        key = services.normalize_idempotency_key(request.query_params.get('clave'))
        previous = m.Auditoria.objects.filter(usuario_id=request.user.pk, entidad='movimientos_inventario',
            accion='AJUSTAR', datos__idempotency_key=key).first()
        if previous:
            obj = m.MovimientosInventario.objects.get(pk=previous.datos['movimiento_id'])
            result = services.adjustment_result(obj, previous.datos['saldo_resultante'])
        else:
            result = None
        return Response({'encontrado':bool(previous), 'resultado':result})
    def create(self, request):
        serializer = AjusteInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        data, created = services.adjust_stock(serializer.validated_data, request.user, request.headers.get('Idempotency-Key'))
        return Response(data, status=201 if created else 200)


class AlertaViewSet(PrivateViewSet):
    http_method_names = ['get', 'head', 'options']
    def list(self, request):
        kind = request.query_params.get('tipo', 'bajo_stock')
        if kind == 'bajo_stock':
            params = request.query_params.copy()
            params.pop('tipo', None)
            if 'tipo_articulo' in params:
                params['tipo'] = params['tipo_articulo']
            params['bajo_minimo'], params['activo'] = 'true', 'true'
            rows, serializer = selectors.stock(params), InventarioStockOutput
        elif kind == 'vencimiento':
            rows, serializer = selectors.expiry_alerts(request.query_params), VencimientoOutput
        else:
            raise ValidationError({'tipo': 'Usa bajo_stock o vencimiento.'})
        page = self.paginate_queryset(rows)
        response = self.get_paginated_response(serializer(page, many=True).data)
        response.data['tipo_alerta'] = kind
        if kind == 'vencimiento':
            response.data['advertencia'] = 'Fechas de compras recibidas; no confirma existencias actuales por lote.'
        return response


class CostoRecetaViewSet(PrivateViewSet):
    http_method_names = ['get', 'head', 'options']
    def retrieve(self, request, pk=None):
        return Response(selectors.recipe_cost(pk))

