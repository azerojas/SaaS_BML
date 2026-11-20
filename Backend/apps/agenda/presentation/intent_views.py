"""Recover results or close unused keys under the mutation lock; no schema changes."""
from uuid import UUID
from django.db import connection, transaction
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.decorators import action
from apps.finanzas.models import IdempotencyRecord
from apps.finanzas.infrastructure.schema import ensure_ready
from .views import BaseView

OPERATIONS = {
    **{'agenda.jornada.' + op: 'agenda.manage_schedules' for op in ('guardar','restablecer')},
    **{'agenda.' + op: 'agenda.manage_professionals' for op in ('profesional.crear', 'profesional.editar', 'profesional.especialidades')},
    **{'agenda.horario.' + op: 'agenda.manage_schedules' for op in ('crear', 'editar', 'retirar')},
    **{'agenda.bloqueo.' + op: 'agenda.manage_blocks' for op in ('crear', 'editar', 'retirar')},
    **{'agenda.cita.' + op: 'agenda.manage_appointments' for op in ('crear', 'reprogramar', 'cancelar', 'confirmar', 'completar', 'no-asistio', 'expirar')},
    **{'agenda.espera.' + op: 'agenda.manage_waitlist' for op in ('crear', 'oferta-manual', 'cancelar', 'convertir')},
    **{'anticipo.' + op: 'finanzas.manage_advances' for op in ('crear', 'confirmar', 'anular')},
    'agenda.cita.llegada': 'agenda.link_arrivals',
    'agenda.configurar': 'agenda.configure_agenda',
}

# Deliberately not a SHA-256 digest: no original request can match a closed key.
CLOSED_HASH = '!' * 64


class IntentView(BaseView):
    own_agenda_read=True
    own_schedule_write=True
    own_schedule_actions=('resolver',)
    http_method_names = ['get', 'post', 'head', 'options']
    lookup_value_regex = '[0-9a-fA-F-]{36}'

    def validate_operation(self, request, pk, values):
        ensure_ready()
        if not isinstance(values, dict) or set(values) != {'operacion'}:
            raise ValidationError('Indica exclusivamente operacion.')
        try:
            key = UUID(pk)
            if not key.int:
                raise ValueError
        except (ValueError, TypeError, AttributeError):
            raise ValidationError({'clave': 'UUID no nula requerida.'}) from None
        operation = values['operacion']
        if not isinstance(operation, str):
            raise ValidationError({'operacion': 'Operacion no soportada.'})
        permission = OPERATIONS.get(operation)
        if permission is None:
            raise ValidationError({'operacion': 'Operacion no soportada.'})
        if request.user.has_perm('agenda.view_own_agenda') and not request.user.has_perm('agenda.view_agenda'):
            from apps.agenda.application.access import own_professional
            own_professional(request.user)
            if operation != 'agenda.jornada.guardar':
                raise PermissionDenied()
            permission = 'agenda.manage_own_schedule'
        required = [permission]
        if operation.startswith('anticipo.'):
            required.append('finanzas.view_finance')
        if operation == 'agenda.espera.convertir':
            required.append('agenda.manage_appointments')
        if not all(request.user.has_perm(value) for value in required):
            raise PermissionDenied()
        return key, operation

    def result(self, record, operation):
        closed = record is not None and record.request_hash == CLOSED_HASH
        return Response({'encontrado': record is not None and not closed,
                         'cerrado': closed, 'operacion': operation,
                         'resultado': record.response_body if record and not closed else None,
                         'estado_http': record.response_status if record and not closed else None})

    def retrieve(self, request, pk=None):
        key, operation = self.validate_operation(request, pk, request.query_params.dict())
        # Serialize with the same lock as mutation. Never race an uncommitted response.
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute('SELECT pg_advisory_xact_lock(718302453)')
            record = IdempotencyRecord.objects.filter(actor=request.user, operation=operation, key=key).first()
            return self.result(record, operation)

    @action(detail=True, methods=['post'])
    def resolver(self, request, pk=None):
        if request.query_params:
            raise ValidationError('No se admiten parametros.')
        key, operation = self.validate_operation(request, pk, request.data)
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute('SELECT pg_advisory_xact_lock(718302453)')
            record = IdempotencyRecord.objects.filter(actor=request.user, operation=operation, key=key).first()
            if record is None:
                # A delayed original request acquires this same lock and must then
                # fail its hash check, rather than commit after we reported closure.
                record = IdempotencyRecord.objects.create(
                    actor=request.user, operation=operation, key=key,
                    request_hash=CLOSED_HASH, response_status=409,
                    response_body={'code': 'idempotencia_cerrada'},
                )
            return self.result(record, operation)
