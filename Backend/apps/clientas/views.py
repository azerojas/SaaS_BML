from apps.operaciones.presentation.permissions import LegacyModelPermission
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from negocio.models import Clientas
from . import selectors, services
from .serializers import ClientaInputSerializer, ClientaListSerializer, ClientaDetailSerializer, ConsentimientoSerializer


class ClientaPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100

    def paginate_queryset(self, queryset, request, view=None):
        if 'page_size' in request.query_params:
            try:
                if int(request.query_params['page_size']) < 1:
                    raise ValueError
            except ValueError:
                raise ValidationError({'page_size': 'Usa un entero positivo.'})
        return super().paginate_queryset(queryset, request, view)


class ClientaViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [LegacyModelPermission]
    pagination_class = ClientaPagination
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        if self.action == 'list':
            return selectors.clientas_list(self.request.query_params)
        return Clientas.objects.all()

    def get_serializer_class(self):
        return ClientaListSerializer if self.action == 'list' else ClientaDetailSerializer

    def create(self, request):
        serializer = ClientaInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        obj = services.save_clienta(serializer.validated_data, request.user)
        return Response(ClientaDetailSerializer(obj).data, status=201)

    def partial_update(self, request, pk=None):
        obj = self.get_object()
        serializer = ClientaInputSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        obj = services.save_clienta(serializer.validated_data, request.user, obj.pk)
        return Response(ClientaDetailSerializer(obj).data)

    @action(detail=True, methods=['post'])
    def desactivar(self, request, pk=None):
        return Response(ClientaDetailSerializer(services.set_active(self.get_object().pk, False, request.user)).data)

    @action(detail=True, methods=['post'])
    def reactivar(self, request, pk=None):
        return Response(ClientaDetailSerializer(services.set_active(self.get_object().pk, True, request.user)).data)

    @action(detail=True, methods=['post'])
    def consentimiento(self, request, pk=None):
        obj = self.get_object()
        serializer = ConsentimientoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(ClientaDetailSerializer(services.set_consent(obj.pk, serializer.validated_data, request.user)).data)

