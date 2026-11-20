import re
from decimal import Decimal
from rest_framework import serializers
from apps.catalogo.serializers.inputs import InputSerializer
from apps.inventario.api.serializers import ExactDecimalField
from apps.checkin.presentation.serializers import ExplicitBoolean
from negocio import models as m

METHODS=['EFECTIVO','YAPE','PLIN','TRANSFERENCIA','TARJETA','OTRO']


class RefundInput(InputSerializer):
    pago_id=serializers.IntegerField(min_value=1,required=False)
    anticipo_id=serializers.IntegerField(min_value=1,required=False)
    monto=ExactDecimalField(max_digits=12,decimal_places=2,min_value=Decimal('0.01'))
    metodo=serializers.ChoiceField(choices=METHODS)
    motivo=serializers.CharField(min_length=8,max_length=250)
    referencia=serializers.RegexField(r'^[A-Z0-9_-]{4,100}$',required=False)
    devolucion_verificada=ExplicitBoolean()

    def validate(self,data):
        if ('pago_id' in data)==('anticipo_id' in data) or data['devolucion_verificada'] is not True:
            raise serializers.ValidationError('Una sola fuente y devolucion verificada requeridas.')
        return data


class AdjustmentInput(InputSerializer):
    monto=ExactDecimalField(max_digits=12,decimal_places=2,min_value=Decimal('0.01'))
    motivo=serializers.CharField(min_length=8,max_length=250)


class ReconciliationInput(InputSerializer):
    fecha=serializers.DateField()
    metodo=serializers.ChoiceField(choices=METHODS)
    observado=ExactDecimalField(max_digits=16,decimal_places=2)
    evidencia_sha256=serializers.RegexField(r'^[a-f0-9]{64}$')
    referencia=serializers.CharField(min_length=8,max_length=100)


class VisitCreate(InputSerializer):
    clienta_id = serializers.IntegerField(min_value=1)
    llegada_id = serializers.IntegerField(min_value=1, required=False)
    cita_id = serializers.IntegerField(min_value=1, required=False)
    notas = serializers.CharField(max_length=10000, required=False, allow_null=True, allow_blank=True)


class VisitNotes(InputSerializer):
    notas = serializers.CharField(max_length=10000, allow_null=True, allow_blank=True)


class Reason(InputSerializer):
    motivo = serializers.CharField(min_length=8, max_length=250)


class SaleLine(InputSerializer):
    id = serializers.IntegerField(min_value=1, required=False)
    tipo = serializers.ChoiceField(choices=['SERVICIO','PRODUCTO'])
    servicio_id = serializers.IntegerField(min_value=1, required=False)
    articulo_id = serializers.IntegerField(min_value=1, required=False)
    unidad_id = serializers.IntegerField(min_value=1, required=False)
    profesional_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    cantidad = ExactDecimalField(max_digits=14, decimal_places=3, min_value=Decimal('0.001'))
    descuento_linea = ExactDecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'), required=False)
    precio_unitario = ExactDecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'), required=False)
    motivo_precio = serializers.CharField(min_length=8, max_length=250, required=False)

    def validate(self, data):
        service = data['tipo']=='SERVICIO'
        if service and ('servicio_id' not in data or 'articulo_id' in data or 'unidad_id' in data):
            raise serializers.ValidationError('SERVICIO requiere solo servicio_id y no articulo/unidad.')
        if not service and ('articulo_id' not in data or 'unidad_id' not in data or 'servicio_id' in data or data.get('profesional_id') is not None):
            raise serializers.ValidationError('PRODUCTO requiere articulo/unidad, sin servicio ni profesional.')
        return data


class SaleCreate(InputSerializer):
    visita_id = serializers.IntegerField(min_value=1, required=False)
    cita_id = serializers.IntegerField(min_value=1, required=False)
    clienta_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    descuento_global = ExactDecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'), required=False)
    propina = ExactDecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'), required=False)
    lineas = SaleLine(many=True, max_length=100, required=False)


class SaleUpdate(InputSerializer):
    descuento_global = ExactDecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'), required=False)
    propina = ExactDecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'), required=False)
    lineas = SaleLine(many=True, max_length=100, required=False)


class ConsumptionItem(InputSerializer):
    articulo_id = serializers.IntegerField(min_value=1)
    unidad_id = serializers.IntegerField(min_value=1)
    cantidad = ExactDecimalField(max_digits=14, decimal_places=3, min_value=Decimal('0.001'))


class ConsumptionGroup(InputSerializer):
    detalle_id = serializers.IntegerField(min_value=1)
    insumos = ConsumptionItem(many=True, max_length=100)


class Preview(InputSerializer):
    consumos_reales = ConsumptionGroup(many=True, max_length=100, required=False)


class ConfirmSale(Preview):
    consumos_revisados = ExplicitBoolean()
    consumos_reales = ConsumptionGroup(many=True, max_length=100)


class PaymentInput(InputSerializer):
    metodo = serializers.ChoiceField(choices=METHODS)
    monto = ExactDecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
    referencia = serializers.CharField(max_length=100, required=False, allow_null=True, allow_blank=True)
    verificado_manualmente = ExplicitBoolean()

    def validate_referencia(self, value):
        return re.sub(r'\s+', '', value).upper() if value else None


class VoidPayment(Reason):
    error_registro_confirmado = ExplicitBoolean()


class AdvanceCreate(InputSerializer):
    cita_id = serializers.IntegerField(min_value=1)
    metodo = serializers.ChoiceField(choices=METHODS)
    monto = ExactDecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
    referencia = serializers.CharField(max_length=100, required=False, allow_null=True, allow_blank=True)

    def validate_referencia(self, value):
        return re.sub(r'\s+', '', value).upper() if value else None


class AdvanceConfirm(InputSerializer):
    verificado_manualmente = ExplicitBoolean()
    referencia = serializers.CharField(max_length=100, required=False, allow_null=True, allow_blank=True)
    metodo = serializers.ChoiceField(choices=METHODS, required=False)

    def validate_referencia(self, value):
        return re.sub(r'\s+', '', value).upper() if value else None


class AdvanceApply(InputSerializer):
    anticipo_id = serializers.IntegerField(min_value=1)
    monto = ExactDecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))


class VisitOutput(serializers.ModelSerializer):
    class Meta:
        model=m.Visitas
        fields=['id','clienta_id','llegada_id','inicio_en','fin_en','estado','notas']
        read_only_fields=fields


class ProfessionalOutput(serializers.ModelSerializer):
    class Meta:
        model=m.Profesionales
        fields=['id','nombres','apellidos','comision_porcentaje','activa']
        read_only_fields=fields


class ConsumptionOutput(serializers.ModelSerializer):
    class Meta:
        model=m.ConsumosServicio
        fields=['id','articulo_id','cantidad','costo_unitario_snapshot']
        read_only_fields=fields


class SaleLineOutput(serializers.ModelSerializer):
    profesional_nombre = serializers.SerializerMethodField()
    duracion_minutos = serializers.SerializerMethodField()
    consumos=ConsumptionOutput(source='consumosservicio_set', many=True)
    def get_profesional_nombre(self, obj):
        return f'{obj.profesional.nombres} {obj.profesional.apellidos}' if obj.profesional_id else None
    def get_duracion_minutos(self, obj):
        return self.context.get('durations', {}).get(obj.servicio_id) if obj.servicio_id else None
    class Meta:
        model=m.DetallesVenta
        fields=['id','tipo','servicio_id','articulo_id','profesional_id','descripcion_snapshot','cantidad',
                'precio_unitario','descuento_linea','costo_unitario_snapshot','comision_porcentaje_snapshot','consumos','profesional_nombre','duracion_minutos']
        read_only_fields=fields


class SaleListOutput(serializers.ModelSerializer):
    class Meta:
        model=m.Ventas
        fields=['id','visita_id','clienta_id','estado','creada_en','confirmada_en','subtotal','descuento_global','propina','total']
        read_only_fields=fields


class SaleOutput(SaleListOutput):
    lineas=SaleLineOutput(source='detallesventa_set',many=True)
    class Meta(SaleListOutput.Meta):
        fields=SaleListOutput.Meta.fields+['lineas']
        read_only_fields=fields


class PaymentOutput(serializers.ModelSerializer):
    class Meta:
        model=m.Pagos
        fields=['id','venta_id','metodo','monto','estado','pagado_en','referencia']
        read_only_fields=fields


class AdvanceOutput(serializers.ModelSerializer):
    class Meta:
        model=m.AnticiposCita
        fields=['id','cita_id','venta_id','metodo','monto','estado','referencia','pagado_en','creado_en']
        read_only_fields=fields

