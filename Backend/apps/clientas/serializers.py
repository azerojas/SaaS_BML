import re
import unicodedata
from django.conf import settings
from django.utils import timezone
from rest_framework import serializers
from negocio.models import Clientas


def normalize_phone(value):
    value = unicodedata.normalize('NFKC', value).strip()
    if not re.fullmatch(r'[+0-9 ()-]+', value):
        raise serializers.ValidationError('Usa un telefono internacional con + y codigo de pais.')
    compact = re.sub(r'[ ()-]', '', value)
    # Peru mobile without prefix is the only implicit country conversion.
    if re.fullmatch(r'9[0-9]{8}', compact):
        compact = '+51' + compact
    if not re.fullmatch(r'\+[1-9][0-9]{7,14}', compact):
        raise serializers.ValidationError('Usa formato internacional, por ejemplo +51999123456.')
    if compact.startswith('+51') and not re.fullmatch(r'\+51(?:9[0-9]{8}|[1-8][0-9]{7})', compact):
        raise serializers.ValidationError('Usa un celular peruano de 9 digitos o un fijo con codigo de area.')
    return compact


class StrictInputMixin:
    def to_internal_value(self, data):
        if isinstance(data, dict):
            unknown = set(data) - set(self.fields)
            if unknown:
                raise serializers.ValidationError({key: 'Campo no permitido.' for key in sorted(unknown)})
        return super().to_internal_value(data)


class ClientaInputSerializer(StrictInputMixin, serializers.Serializer):
    nombres = serializers.CharField(max_length=120)
    apellidos = serializers.CharField(max_length=120)
    telefono = serializers.CharField(max_length=40)
    email = serializers.EmailField(max_length=150, required=False, allow_null=True, allow_blank=True)
    fecha_nacimiento = serializers.DateField(required=False, allow_null=True)
    notas_privadas = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=10000)

    def validate_nombres(self, value):
        return ' '.join(value.split())

    def validate_apellidos(self, value):
        return ' '.join(value.split())

    def validate_telefono(self, value):
        return normalize_phone(value)

    def validate_fecha_nacimiento(self, value):
        if value and value > timezone.localdate():
            raise serializers.ValidationError('La fecha no puede ser futura.')
        return value


class ClientaListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Clientas
        fields = ['id', 'nombres', 'apellidos', 'telefono', 'activa']
        read_only_fields = fields


class ClientaDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Clientas
        fields = ['id', 'nombres', 'apellidos', 'telefono', 'email', 'fecha_nacimiento',
                  'notas_privadas', 'consentimiento_datos', 'consentimiento_fecha',
                  'acepta_recordatorios', 'activa', 'creado_en', 'actualizado_en']
        read_only_fields = fields


class ConsentimientoSerializer(StrictInputMixin, serializers.Serializer):
    otorgado = serializers.BooleanField()
    evidencia = serializers.CharField(max_length=500)
    version_aviso = serializers.CharField(max_length=80)

    def validate(self, attrs):
        if not settings.PRIVACY_NOTICE_VERSION or not settings.PRIVACY_NOTICE_URL:
            raise serializers.ValidationError('Primero configura el aviso de privacidad del negocio.')
        if attrs['version_aviso'] != settings.PRIVACY_NOTICE_VERSION:
            raise serializers.ValidationError({'version_aviso': 'Version de aviso no vigente.'})
        return attrs

