from rest_framework import serializers
from apps.clientas.serializers import normalize_phone
from .serializers import StrictInput, ZonedDateTime, Boolean


class PublicBookingInput(StrictInput):
    nombres = serializers.CharField(max_length=120)
    apellidos = serializers.CharField(max_length=120)
    telefono = serializers.CharField(max_length=40)
    profesional_id = serializers.IntegerField(min_value=1)
    servicios = serializers.ListField(child=serializers.IntegerField(min_value=1), min_length=1, max_length=10)
    inicio_en = ZonedDateTime()
    consentimiento_datos = Boolean()
    version_aviso = serializers.CharField(max_length=100)

    def validate_telefono(self, value):
        return normalize_phone(value)

    def validate(self, attrs):
        if not attrs['consentimiento_datos']:
            raise serializers.ValidationError('Debes aceptar el aviso de privacidad.')
        return attrs


class AccessInput(StrictInput):
    token = serializers.UUIDField(required=False)
    telefono = serializers.CharField(max_length=40, required=False)
    codigo = serializers.RegexField(r'^\d{8}$', required=False, trim_whitespace=True)

    def validate_telefono(self, value):
        return normalize_phone(value)

    def validate(self, attrs):
        if set(attrs) not in ({'token'}, {'telefono', 'codigo'}):
            raise serializers.ValidationError(
                'Indica el enlace privado antiguo o el teléfono y la clave de ocho cifras.'
            )
        return attrs


class PublicRescheduleInput(StrictInput):
    inicio_en = ZonedDateTime()


class PublicCancelInput(StrictInput):
    motivo = serializers.CharField(min_length=8, max_length=250)


class ApprovalInput(StrictInput):
    identidad_verificada = Boolean()
    consentimiento_verificado = Boolean()

    def validate(self, attrs):
        if not all(attrs.values()):
            raise serializers.ValidationError('Verifica identidad y consentimiento antes de confirmar.')
        return attrs

