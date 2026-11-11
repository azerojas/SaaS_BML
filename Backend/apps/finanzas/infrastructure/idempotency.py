import hashlib
import json
from datetime import date, datetime, time
from decimal import Decimal
from uuid import UUID
from django.db import IntegrityError, OperationalError, connection, transaction
from . import schema
from apps.finanzas.models import IdempotencyRecord
from apps.finanzas.domain.errors import FinanceError


def canonical(value):
    if isinstance(value, Decimal):
        return format(value, 'f')
    if isinstance(value, (date, datetime, time)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, dict):
        return {key: canonical(item) for key, item in sorted(value.items())}
    if isinstance(value, (list, tuple)):
        return [canonical(item) for item in value]
    if isinstance(value, float):
        raise FinanceError('decimal_requerido', 'No se aceptan float.', 'invalid')
    return value


def execute(operation, key, payload, actor, callback):
    schema.ensure_ready()
    try:
        parsed = UUID(key) if isinstance(key, str) and len(key) == 36 else None
        if parsed is None or parsed.int == 0:
            raise ValueError
    except (ValueError, TypeError, AttributeError):
        raise FinanceError('idempotencia_clave_invalida', 'Envie Idempotency-Key UUID no nula.', 'invalid') from None
    digest = hashlib.sha256(json.dumps(canonical(payload), ensure_ascii=True, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    try:
        with transaction.atomic():
            # Financial mutation order is shared by all workers; then the phase-1/4 client lock.
            with connection.cursor() as cursor:
                cursor.execute('SELECT pg_advisory_xact_lock(718302453)')
                cursor.execute('SELECT pg_advisory_xact_lock(718302451)')
            previous = IdempotencyRecord.objects.select_for_update().filter(actor_id=actor.pk, operation=operation, key=parsed).first()
            if previous:
                if previous.request_hash != digest:
                    raise FinanceError('idempotencia_conflicto', 'La clave ya se uso con otra solicitud.')
                return previous.response_body, previous.response_status
            body, status = callback(parsed)
            body = canonical(body)
            IdempotencyRecord.objects.create(key=parsed, actor_id=actor.pk, operation=operation,
                request_hash=digest, response_status=status, response_body=body)
            return body, status
    except IntegrityError as exc:
        if getattr(exc.__cause__, 'sqlstate', '') in ('23505', '23503', '23514'):
            raise FinanceError('integridad_financiera', 'Conflicto de fuentes, referencias o restricciones; no se guardaron cambios.') from None
        raise
    except OperationalError as exc:
        if getattr(exc.__cause__, 'sqlstate', '') in ('40P01', '40001', '55P03'):
            raise FinanceError('reintentar_transaccion', 'Reintenta la misma operacion y clave; no hubo confirmacion parcial.') from None
        raise

