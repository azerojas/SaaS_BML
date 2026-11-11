from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError
from negocio.models import Auditoria, Clientas
from .serializers import normalize_phone


class PhoneConflict(APIException):
    status_code = 409
    default_code = 'telefono_duplicado'
    default_detail = 'Ya existe una clienta con este telefono.'


def audit(user, obj, action, data):
    Auditoria.objects.create(usuario_id=user.pk, entidad='clientas', entidad_id=str(obj.pk),
                             accion=action, datos=data, creada_en=timezone.now())


def check_phone(phone, excluding=None):
    # Compare existing legacy formatting too, without rewriting historical rows.
    for pk, existing in Clientas.objects.exclude(pk=excluding).values_list('pk', 'telefono').iterator():
        try:
            equivalent = normalize_phone(existing) == phone
        except ValidationError:
            equivalent = existing == phone
        if equivalent:
            raise PhoneConflict()


def save_clienta(data, user, pk=None):
    try:
        with transaction.atomic():
            # Serialize API writes so normalized legacy numbers cannot race.
            from django.db import connection
            with connection.cursor() as cursor:
                cursor.execute('SELECT pg_advisory_xact_lock(718302451)')
            obj = Clientas.objects.select_for_update().get(pk=pk) if pk else None
            if 'telefono' in data:
                check_phone(data['telefono'], pk)
            if obj is None:
                obj = Clientas.objects.create(**data, activa=True, consentimiento_datos=False,
                    consentimiento_fecha=None, acepta_recordatorios=False,
                    canal_preferido='EMAIL')
                action = 'CREAR'
            else:
                for field, value in data.items():
                    setattr(obj, field, value)
                if data:
                    obj.save(update_fields=list(data))
                action = 'MODIFICAR'
            audit(user, obj, action, {'campos': sorted(data)})
            obj.refresh_from_db()
            return obj
    except IntegrityError as exc:
        if getattr(exc.__cause__, 'diag', None) and exc.__cause__.diag.constraint_name == 'clientas_telefono_key':
            raise PhoneConflict() from None
        raise


@transaction.atomic
def set_active(pk, active, user):
    obj = Clientas.objects.select_for_update().get(pk=pk)
    if obj.activa != active:
        obj.activa = active
        obj.save(update_fields=['activa'])
        audit(user, obj, 'REACTIVAR' if active else 'DESACTIVAR', {})
    obj.refresh_from_db()
    return obj


@transaction.atomic
def set_consent(pk, data, user):
    obj = Clientas.objects.select_for_update().get(pk=pk)
    obj.consentimiento_datos = data['otorgado']
    obj.consentimiento_fecha = timezone.now() if data['otorgado'] else None
    obj.save(update_fields=['consentimiento_datos', 'consentimiento_fecha'])
    # Evidence must be a non-sensitive reference, not a copy of personal documents.
    audit(user, obj, 'CONSENTIMIENTO', data)
    obj.refresh_from_db()
    return obj

