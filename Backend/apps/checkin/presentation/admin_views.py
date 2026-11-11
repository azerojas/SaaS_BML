from apps.operaciones.presentation.permissions import LegacyModelPermission
from django.http import HttpResponse
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from apps.catalogo.pagination import CatalogPagination
from apps.inventario.api.views import empty_body
from apps.checkin.application import commands, selectors
from apps.checkin.infrastructure.qr_renderer import checkin_url, render_qr
from negocio import models as m
from .serializers import (PuntoInput, PuntoOutput, ArrivalListOutput, ConfirmInput, ResolutionInput,
                         ManualArrivalInput, VisitOutput, AssociateVisitInput, LinkAppointmentInput)


class PrivateBase(viewsets.GenericViewSet):
    permission_classes = [LegacyModelPermission]
    pagination_class = CatalogPagination
    lookup_value_regex = '[0-9]+'


class PuntoViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, PrivateBase):
    serializer_class = PuntoOutput
    http_method_names = ['get', 'post', 'patch', 'head', 'options']
    queryset = m.PuntosQr.objects.order_by('nombre', 'id')
    def create(self, request):
        serializer = PuntoInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(PuntoOutput(commands.save_point(serializer.validated_data, request.user)).data, status=201)
    def partial_update(self, request, pk=None):
        point = self.get_object()
        serializer = PuntoInput(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return Response(PuntoOutput(commands.save_point(serializer.validated_data, request.user, point.pk)).data)
    @action(detail=True, methods=['get'])
    def qr(self, request, pk=None):
        point = self.get_object()
        if not point.activo:
            from rest_framework.exceptions import NotFound
            raise NotFound('Punto desactivado.')
        format = request.query_params.get('formato', 'json')
        if format == 'json':
            return Response({'enlace': checkin_url(point.token), 'formatos': ['svg', 'png']})
        if format not in ('svg', 'png'):
            raise ValidationError({'formato': 'Usa json, svg o png.'})
        result = HttpResponse(render_qr(point.token, format), content_type='image/svg+xml' if format == 'svg' else 'image/png')
        result['Content-Disposition'] = f'inline; filename="punto-{point.pk}.{format}"'
        result['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox"
        return result


class ArrivalViewSet(mixins.ListModelMixin, PrivateBase):
    serializer_class = ArrivalListOutput
    http_method_names = ['get', 'post', 'head', 'options']
    def get_queryset(self):
        return selectors.arrivals(self.request.query_params if self.action == 'list' else {'vigentes': 'all'})
    def retrieve(self, request, pk=None):
        return Response(selectors.arrival_detail(pk))
    def create(self, request):
        serializer = ManualArrivalInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        pk = commands.manual_arrival(serializer.validated_data['clienta_id'], request.user)
        return Response(selectors.arrival_detail(pk), status=201)
    @action(detail=True, methods=['post'])
    def confirmar(self, request, pk=None):
        obj = self.get_object()
        serializer = ConfirmInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        commands.confirm_arrival(obj.pk, serializer.validated_data, request.user)
        return Response(selectors.arrival_detail(obj.pk))
    def resolve(self, request, pk, state):
        obj = self.get_object()
        serializer = ResolutionInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        commands.resolve_arrival(obj.pk, state, serializer.validated_data, request.user)
        return Response(selectors.arrival_detail(obj.pk))
    @action(detail=True, methods=['post'])
    def rechazar(self, request, pk=None):
        return self.resolve(request, pk, 'RECHAZADA')
    @action(detail=True, methods=['post'])
    def cancelar(self, request, pk=None):
        return self.resolve(request, pk, 'CANCELADA')
    @action(detail=False, methods=['post'])
    def expirar(self, request):
        empty_body(request)
        return Response({'canceladas': commands.expire_pending(user=request.user)})
    @action(detail=True, methods=['post'], url_path='crear-visita')
    def crear_visita(self, request, pk=None):
        empty_body(request)
        return Response(VisitOutput(commands.create_visit(self.get_object().pk, request.user)).data)
    @action(detail=True, methods=['post'], url_path='asociar-visita')
    def asociar_visita(self, request, pk=None):
        serializer = AssociateVisitInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(VisitOutput(commands.associate_visit(self.get_object().pk, serializer.validated_data['visita_id'], request.user)).data)
    @action(detail=True, methods=['post'], url_path='enlazar-cita')
    def enlazar_cita(self, request, pk=None):
        serializer = LinkAppointmentInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(VisitOutput(commands.link_appointment(self.get_object().pk, serializer.validated_data['cita_id'], request.user)).data)

