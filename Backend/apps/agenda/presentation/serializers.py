import re
from decimal import Decimal
from rest_framework import serializers
from apps.agenda.domain.commands import BookingCommand,AvailabilityQuery
from negocio import models as m


class StrictInput(serializers.Serializer):
    def to_internal_value(self,data):
        if not isinstance(data,dict):raise serializers.ValidationError('Objeto JSON requerido.')
        unknown=set(data)-set(self.fields)
        if unknown:raise serializers.ValidationError({'campos_desconocidos':sorted(unknown)})
        return super().to_internal_value(data)


class ExactDecimal(serializers.DecimalField):
    def to_internal_value(self,data):
        if not isinstance(data,str):raise serializers.ValidationError('Decimal como cadena JSON obligatorio.')
        return super().to_internal_value(data)


class Boolean(serializers.BooleanField):
    def to_internal_value(self,data):
        if not isinstance(data,bool):raise serializers.ValidationError('Booleano JSON obligatorio.')
        return data


class ZonedDateTime(serializers.DateTimeField):
    def to_internal_value(self,data):
        if not isinstance(data,str) or not re.search(r'(Z|[+-]\d{2}:\d{2})$',data):
            raise serializers.ValidationError('ISO8601 con offset explicito obligatorio.')
        return super().to_internal_value(data)


class LocalTime(serializers.TimeField):
    def to_internal_value(self,data):
        if not isinstance(data,str) or not re.fullmatch(r'\d{2}:\d{2}(:00)?',data):raise serializers.ValidationError('Usa HH:MM, sin offset o segundos distintos de cero.')
        return super().to_internal_value(data)


class ISODate(serializers.DateField):
    def to_internal_value(self,data):
        if not isinstance(data,str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',data):raise serializers.ValidationError('Usa fecha YYYY-MM-DD.')
        return super().to_internal_value(data)


class ProfessionalInput(StrictInput):
    nombres=serializers.CharField(max_length=120)
    apellidos=serializers.CharField(max_length=120)
    telefono=serializers.RegexField(r'^\+?[0-9 ()-]{7,25}$',required=False,allow_null=True,allow_blank=True)
    usuario_id=serializers.IntegerField(min_value=1,allow_null=True,required=False)
    comision_porcentaje=ExactDecimal(max_digits=5,decimal_places=2,min_value=Decimal('0'),max_value=Decimal('100'),required=False)
    visible_reservas=Boolean(required=False)
    activa=Boolean(required=False)


class SpecialtiesInput(StrictInput):
    servicios=serializers.ListField(child=serializers.IntegerField(min_value=1),max_length=200,allow_empty=True)


class ScheduleInput(StrictInput):
    profesional_id=serializers.IntegerField(min_value=1)
    dia_semana=serializers.IntegerField(min_value=1,max_value=7)
    hora_inicio=LocalTime()
    hora_fin=LocalTime()


class DailyIdentifier(StrictInput):
    profesional_id=serializers.IntegerField(min_value=1,allow_null=True,required=False,default=None)
    fecha=ISODate()


class DayInterval(StrictInput):
    inicio=LocalTime()
    fin=LocalTime()
    cupo_unico=Boolean(required=False)


class DailyScheduleInput(DailyIdentifier):
    franjas=DayInterval(many=True,allow_empty=True,max_length=12)

    def validate(self, attrs):
        from apps.agenda.infrastructure import repositories as repo
        single=self.context.get('single_slots') or (attrs.get('profesional_id') and repo.requires_personal_slots(attrs['profesional_id']))
        result=[]
        for item in sorted(attrs['franjas'],key=lambda row:row['inicio']):
            if single:
                item['cupo_unico']=True
            if item['inicio']>=item['fin']:
                raise serializers.ValidationError('Cada franja debe terminar después de su inicio; no cruza medianoche.')
            if result and item['inicio']<result[-1]['fin']:
                raise serializers.ValidationError('Las franjas de un mismo día no se pueden superponer.')
            if result and item['inicio']==result[-1]['fin'] and not item.get('cupo_unico') and not result[-1].get('cupo_unico'):
                result[-1]['fin']=item['fin']
            else:result.append(dict(item))
        attrs['franjas']=result
        return attrs


class BlockInput(StrictInput):
    profesional_id=serializers.IntegerField(min_value=1,allow_null=True,required=False)
    inicio_en=ZonedDateTime()
    fin_en=ZonedDateTime()
    motivo=serializers.CharField(min_length=8,max_length=200)
    excepcion_historica=Boolean(required=False)


class Reason(StrictInput):
    motivo=serializers.CharField(min_length=8,max_length=250)


class RetireInput(Reason):
    confirmar_retiro=Boolean()
    def validate_confirmar_retiro(self,value):
        if value is not True:raise serializers.ValidationError('Confirma el retiro del horario/bloqueo.')
        return value


class BookingInput(StrictInput):
    clienta_id=serializers.IntegerField(min_value=1)
    profesional_id=serializers.IntegerField(min_value=1)
    servicios=serializers.ListField(child=serializers.IntegerField(min_value=1),min_length=1,max_length=10)
    inicio_en=ZonedDateTime()
    notas=serializers.CharField(required=False,allow_blank=True,allow_null=True,max_length=5000)
    origen=serializers.ChoiceField(choices=['MANUAL','TELEFONO'],required=False)


class RescheduleInput(Reason):
    inicio_en=ZonedDateTime()
    profesional_id=serializers.IntegerField(min_value=1,required=False)
    servicios=serializers.ListField(child=serializers.IntegerField(min_value=1),min_length=1,max_length=10,required=False)


class CancelInput(Reason):
    fuera_plazo_autorizado=Boolean(required=False)


class LinkInput(StrictInput):
    llegada_id=serializers.IntegerField(min_value=1)


class WaitInput(StrictInput):
    clienta_id=serializers.IntegerField(min_value=1)
    servicio_id=serializers.IntegerField(min_value=1)
    profesional_id=serializers.IntegerField(min_value=1,required=False,allow_null=True)
    fecha_deseada=ISODate()
    franja_inicio=LocalTime(required=False)
    franja_fin=LocalTime(required=False)


class ConvertInput(StrictInput):
    inicio_en=ZonedDateTime()
    profesional_id=serializers.IntegerField(min_value=1,required=False)


class OfferInput(StrictInput):
    oferta_registrada_manualmente=Boolean()


class ConfigInput(StrictInput):
    reservas_online_activas=Boolean(required=False)
    intervalo_slots_minutos=serializers.IntegerField(min_value=5,max_value=120,required=False)
    anticipacion_minima_minutos=serializers.IntegerField(min_value=0,max_value=10080,required=False)
    anticipacion_maxima_dias=serializers.IntegerField(min_value=1,max_value=366,required=False)
    horas_limite_cancelacion=serializers.IntegerField(min_value=0,max_value=8760,required=False)
    anticipo_porcentaje=ExactDecimal(max_digits=5,decimal_places=2,min_value=Decimal('0'),max_value=Decimal('100'),required=False)
    minutos_expiracion_pago=serializers.IntegerField(min_value=1,max_value=1440,required=False)
    max_citas_activas_por_clienta=serializers.IntegerField(min_value=1,max_value=20,required=False)


class AvailabilityInput(StrictInput):
    cita_id=serializers.IntegerField(min_value=1,required=False)
    fecha=ISODate()
    profesional_id=serializers.IntegerField(min_value=1)
    servicios=serializers.ListField(child=serializers.IntegerField(min_value=1),min_length=1,max_length=10)


class ProfessionalOutput(serializers.ModelSerializer):
    publicacion_propia=serializers.SerializerMethodField()
    def get_publicacion_propia(self,obj):
        if hasattr(obj,'publicacion_propia'):
            return obj.publicacion_propia
        from apps.agenda.infrastructure.repositories import requires_personal_slots
        return requires_personal_slots(obj.pk)
    servicios = serializers.SerializerMethodField()
    def get_servicios(self, obj):
        return [row.servicio_id for row in obj.profesionalservicios_set.all()]
    def to_representation(self, instance):
        result = super().to_representation(instance)
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.has_perm('agenda.manage_professionals'):
            for field in ('comision_porcentaje', 'telefono', 'visible_reservas'):
                result.pop(field, None)
        if not user or not user.has_perm('agenda.assign_users'):
            result.pop('usuario_id', None)
        return result

    class Meta:
        model=m.Profesionales
        fields=['id','nombres','apellidos','telefono','usuario_id','comision_porcentaje','visible_reservas','activa','servicios','publicacion_propia']


class ScheduleOutput(serializers.ModelSerializer):
    class Meta:
        model=m.HorariosProfesional
        fields=['id','profesional_id','dia_semana','hora_inicio','hora_fin']


class BlockOutput(serializers.ModelSerializer):
    class Meta:
        model=m.BloqueosAgenda
        fields=['id','profesional_id','inicio_en','fin_en','motivo']


class AppointmentOutput(serializers.ModelSerializer):
    clienta_nombre=serializers.SerializerMethodField()
    servicios_nombres=serializers.SerializerMethodField()
    def get_clienta_nombre(self,obj):
        return f'{obj.clienta.nombres} {obj.clienta.apellidos}'.strip()
    def get_servicios_nombres(self,obj):
        return [row.servicio.nombre for row in obj.citaservicios_set.all()]
    class Meta:
        model=m.Citas
        # Even private serializers omit token/code; not needed by the authenticated calendar.
        fields=['id','clienta_id','clienta_nombre','servicios_nombres','profesional_id','visita_id','origen','estado','inicio_en','fin_en','duracion_total_minutos','precio_total','anticipo_requerido','expira_en','confirmada_en','cancelada_en','cancelada_por','motivo_cancelacion','notas']


class AppointmentServiceOutput(serializers.ModelSerializer):
    class Meta:
        model=m.CitaServicios
        fields=['id','servicio_id','orden','duracion_minutos','precio_snapshot']


class WaitOutput(serializers.ModelSerializer):
    class Meta:
        model=m.ListaEspera
        fields=['id','clienta_id','servicio_id','profesional_id','fecha_deseada','franja_inicio','franja_fin','estado']
