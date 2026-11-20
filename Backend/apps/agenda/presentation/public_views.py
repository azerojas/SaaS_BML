from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError, MethodNotAllowed
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.agenda.application import public_booking as booking
from apps.agenda.infrastructure import repositories as repo
from apps.agenda.infrastructure.transactions import agenda_transaction
from apps.agenda.models import PublicBookingRequest, PublicBookingIntent
from apps.checkin.infrastructure.abuse_protection import consume
from .views import ErrorMixin, BaseView
from . import public_serializers as s


@method_decorator(csrf_protect, name='dispatch')
class CustomerBookingView(ErrorMixin, APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    http_method_names = ['get', 'post', 'head', 'options']
    resource = None

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        allowed = {'configuracion': {'GET','HEAD'}, 'acceso': {'POST'}, 'salir': {'POST'},
            'solicitudes': {'GET','HEAD','POST'}, 'detalle': {'GET','HEAD'}, 'cancelar': {'POST'},
            'reprogramar': {'POST'}, 'disponibilidad': {'GET','HEAD'}, 'intentos': {'GET','HEAD'}}
        if request.method != 'OPTIONS' and request.method not in allowed[self.resource]:
            raise MethodNotAllowed(request.method)
        consume([('customer-booking-ip', request.META.get('REMOTE_ADDR',''), 90, 60)])
        booking.ready()

    def parse(self, cls):
        serializer = cls(data=self.request.data)
        serializer.is_valid(raise_exception=True)
        return serializer.validated_data

    def get(self, request, pk=None, key=None):
        if self.resource == 'configuracion':
            booking.browser(request)
            cfg = repo.config()
            return Response({'habilitada': settings.AGENDA_PUBLIC_WRITE_ENABLED and settings.AGENDA_PUBLIC_READ_ENABLED and cfg.reservas_online_activas,
                'horas_limite_cancelacion': cfg.horas_limite_cancelacion,
                'minutos_revision': settings.AGENDA_REQUEST_HOLD_MINUTES,
                'privacy_notice': booking.notice()})
        if self.resource == 'intentos':
            with agenda_transaction():
                row = PublicBookingIntent.objects.filter(owner_hash=booking.browser(request), key=key).first()
                return Response({'found': bool(row), **({'result': booking.restore_intent(row.result)} if row else {})})
        if self.resource == 'solicitudes':
            ids = request.session.get('booking_requests', [])
            rows = PublicBookingRequest.objects.filter(pk__in=ids).order_by('-creada_en')[:50]
            return Response({'results': [booking.detail(row, customer=True) for row in rows]})
        if self.resource == 'disponibilidad':
            if set(request.query_params) != {'fecha'} or len(request.query_params.getlist('fecha')) != 1:
                raise ValidationError('Indica una fecha.')
            return Response(booking.slots(request, pk, serializers.DateField().run_validation(request.query_params['fecha'])))
        return Response(booking.detail(booking.owned(request, pk), customer=True))

    def post(self, request, pk=None):
        if request.query_params:
            raise ValidationError('No se admiten parámetros.')
        if self.resource == 'acceso':
            return Response(booking.access(request, **self.parse(s.AccessInput)))
        if self.resource == 'salir':
            request.session.pop('booking_requests', None)
            return Response(status=204)
        consume([('customer-booking-write', request.META.get('REMOTE_ADDR',''), 20, 900)])
        if self.resource == 'solicitudes':
            data = self.parse(s.PublicBookingInput)
            result = booking.mutate(request, request.headers.get('Idempotency-Key'), 'crear', data, lambda: booking.create(request, data))
            return Response(result, status=201)
        data = self.parse(s.PublicCancelInput if self.resource == 'cancelar' else s.PublicRescheduleInput)
        return Response(booking.mutate(request, request.headers.get('Idempotency-Key'), f'{self.resource}:{pk}', data,
            lambda: booking.change(request, pk, self.resource, data)))


class StaffBookingRequestsView(BaseView):
    lookup_value_regex = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    action_permissions = {'aprobar': 'manage_appointments', 'rechazar': 'manage_appointments'}

    def list(self, request):
        booking.ready()
        qs = PublicBookingRequest.objects.order_by('-creada_en')
        if request.query_params.get('estado'):
            state = request.query_params['estado']
            if state not in ['PENDIENTE','CONFIRMADA','CANCELADA','RECHAZADA','EXPIRADA']:
                raise ValidationError('Estado no válido.')
            if state == 'PENDIENTE':
                qs = booking.holds().order_by('-creada_en')
            else:
                qs = qs.filter(estado=state)
        rows = self.paginate_queryset(qs)
        return self.get_paginated_response([booking.detail(row, staff=True) for row in rows])

    @action(detail=True, methods=['post'])
    def aprobar(self, request, pk=None):
        data = self.parse(s.ApprovalInput)
        return self.mutate('solicitud.aprobar', pk, data, lambda key: booking.approve(pk, request.user))

    @action(detail=True, methods=['post'])
    def rechazar(self, request, pk=None):
        data = self.parse(s.PublicCancelInput)
        return self.mutate('solicitud.rechazar', pk, data, lambda key: booking.reject(pk, data['motivo'], request.user))

