from rest_framework import serializers
from apps.catalogo.serializers.inputs import InputSerializer, NameField
from apps.clientas.serializers import normalize_phone
from negocio import models as m


class ExplicitBoolean(serializers.BooleanField):
    def to_internal_value(self, value):
        if not isinstance(value, bool):
            raise serializers.ValidationError('Usa un booleano JSON explicito.')
        return super().to_internal_value(value)


class PublicCheckinInput(InputSerializer):
    telefono = serializers.CharField(max_length=40)
    nombres = NameField(max_length=120, required=False)
    apellidos = NameField(max_length=120, required=False)
    consentimiento_datos = ExplicitBoolean(required=False)
    version_aviso = serializers.CharField(max_length=80, required=False)

    def validate_telefono(self, value):
        return normalize_phone(value)


class PuntoInput(InputSerializer):
    nombre = NameField(max_length=100)
    activo = serializers.BooleanField(required=False)


class PuntoOutput(serializers.ModelSerializer):
    class Meta:
        model = m.PuntosQr
        fields = ['id', 'nombre', 'activo', 'creado_en']
        read_only_fields = fields


class ArrivalListOutput(serializers.ModelSerializer):
    nombres = serializers.CharField(source='clienta.nombres')
    apellidos = serializers.CharField(source='clienta.apellidos')
    telefono = serializers.CharField(source='clienta.telefono')
    clienta_activa = serializers.BooleanField(source='clienta.activa')
    punto_nombre = serializers.CharField(source='punto_qr.nombre', default=None)
    alta_provisional = serializers.BooleanField(read_only=True)
    vencida = serializers.SerializerMethodField()
    def get_vencida(self, obj):
        from apps.checkin.domain.rules import cutoff
        return obj.estado == 'PENDIENTE' and obj.solicitada_en < cutoff()
    class Meta:
        model = m.Llegadas
        fields = ['id', 'clienta_id', 'nombres', 'apellidos', 'telefono', 'clienta_activa',
                  'punto_qr_id', 'punto_nombre', 'origen', 'estado', 'solicitada_en',
                  'confirmada_en', 'alta_provisional', 'vencida']
        read_only_fields = fields


class ConfirmInput(InputSerializer):
    identidad_verificada = ExplicitBoolean()
    consentimiento_verificado = ExplicitBoolean(required=False)
    motivo = serializers.CharField(max_length=250, required=False, allow_blank=True)


class ResolutionInput(InputSerializer):
    motivo = serializers.CharField(max_length=250, required=False, allow_blank=True)


class ManualArrivalInput(InputSerializer):
    clienta_id = serializers.IntegerField(min_value=1)


class AssociateVisitInput(InputSerializer):
    visita_id = serializers.IntegerField(min_value=1)


class LinkAppointmentInput(InputSerializer):
    cita_id = serializers.IntegerField(min_value=1)


class VisitOutput(serializers.ModelSerializer):
    class Meta:
        model = m.Visitas
        fields = ['id', 'clienta_id', 'llegada_id', 'inicio_en', 'fin_en', 'estado']
        read_only_fields = fields

