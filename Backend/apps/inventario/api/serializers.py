from decimal import Decimal
from django.utils import timezone
from rest_framework import serializers
from apps.catalogo.serializers.inputs import InputSerializer, NameField
from apps.catalogo.serializers.outputs import StockOutput
from apps.clientas.serializers import normalize_phone
from apps.inventario.domain.politicas import COST_POLICY, decimal_string, weighted_cost
from negocio import models as m


class ExactDecimalField(serializers.DecimalField):
    def to_internal_value(self, data):
        if not isinstance(data, str):
            raise serializers.ValidationError('Envie una cadena decimal exacta, no un numero JSON.')
        return super().to_internal_value(data)


class ProveedorInput(InputSerializer):
    nombre = NameField(max_length=160)
    ruc = serializers.CharField(max_length=20, required=False, allow_null=True, allow_blank=True)
    telefono = serializers.CharField(max_length=40, required=False, allow_null=True, allow_blank=True)
    email = serializers.EmailField(max_length=150, required=False, allow_null=True, allow_blank=True)
    activo = serializers.BooleanField(required=False)

    def validate_telefono(self, value):
        return normalize_phone(value) if value else None


class ProveedorOutput(serializers.ModelSerializer):
    class Meta:
        model = m.Proveedores
        fields = ['id', 'nombre', 'ruc', 'telefono', 'email', 'activo']
        read_only_fields = fields


class DetalleInput(InputSerializer):
    articulo_id = serializers.IntegerField(min_value=1)
    unidad_id = serializers.IntegerField(min_value=1)
    cantidad = ExactDecimalField(max_digits=14, decimal_places=3, min_value=Decimal('0.001'))
    costo_unitario = ExactDecimalField(max_digits=12, decimal_places=4, min_value=Decimal('0'))
    numero_lote = serializers.CharField(max_length=80, required=False, allow_blank=True, allow_null=True)
    vencimiento = serializers.DateField(required=False, allow_null=True)


class CompraInput(InputSerializer):
    proveedor_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    numero_documento = serializers.CharField(max_length=90, required=False, allow_null=True, allow_blank=True)
    fecha = serializers.DateTimeField(required=False)
    observaciones = serializers.CharField(max_length=10000, required=False, allow_null=True, allow_blank=True)
    detalles = DetalleInput(many=True, required=False, max_length=200)

    def validate_fecha(self, value):
        if value > timezone.now():
            raise serializers.ValidationError('La fecha de compra no puede ser futura.')
        return value


class DetalleOutput(serializers.ModelSerializer):
    articulo_nombre = serializers.CharField(source='articulo.nombre')
    unidad_id = serializers.IntegerField(source='articulo.unidad_id')
    unidad = serializers.CharField(source='articulo.unidad.codigo')
    class Meta:
        model = m.DetallesCompra
        fields = ['id', 'articulo_id', 'articulo_nombre', 'unidad_id', 'unidad', 'cantidad',
                  'costo_unitario', 'numero_lote', 'vencimiento']
        read_only_fields = fields


class CompraListOutput(serializers.ModelSerializer):
    proveedor_nombre = serializers.CharField(source='proveedor.nombre', default=None)
    moneda = serializers.SerializerMethodField()
    def get_moneda(self, obj):
        return 'PEN'
    class Meta:
        model = m.Compras
        fields = ['id', 'proveedor_id', 'proveedor_nombre', 'numero_documento', 'fecha', 'estado', 'total', 'moneda']
        read_only_fields = fields


class CompraOutput(CompraListOutput):
    detalles = DetalleOutput(source='detallescompra_set', many=True)
    class Meta(CompraListOutput.Meta):
        fields = CompraListOutput.Meta.fields + ['observaciones', 'detalles']
        read_only_fields = fields


class AjusteInput(InputSerializer):
    articulo_id = serializers.IntegerField(min_value=1)
    unidad_id = serializers.IntegerField(min_value=1)
    tipo = serializers.ChoiceField(choices=['AJUSTE_ENTRADA', 'AJUSTE_SALIDA'])
    cantidad = ExactDecimalField(max_digits=14, decimal_places=3, min_value=Decimal('0.001'))
    justificacion = NameField(min_length=8, max_length=1000)


class MovimientoOutput(serializers.ModelSerializer):
    registrado_por_id = serializers.IntegerField(read_only=True, allow_null=True)
    articulo_nombre = serializers.CharField(source='articulo.nombre')
    unidad = serializers.CharField(source='articulo.unidad.codigo')
    compra_id = serializers.IntegerField(source='detalle_compra.compra_id', default=None)
    valoracion = serializers.SerializerMethodField()
    def get_valoracion(self, obj):
        if obj.motivo in ('AJUSTE_ENTRADA', 'AJUSTE_SALIDA'):
            return 'NO_VALORIZADO'
        return 'ADQUISICION' if obj.motivo == 'COMPRA' else 'LEGADO'
    class Meta:
        model = m.MovimientosInventario
        fields = ['id', 'articulo_id', 'articulo_nombre', 'unidad', 'fecha', 'motivo',
                  'cantidad_firmada', 'costo_unitario', 'valoracion', 'compra_id',
                  'detalle_compra_id', 'consumo_servicio_id', 'detalle_venta_id', 'notas', 'registrado_por_id']
        read_only_fields = fields


class InventarioStockOutput(StockOutput):
    sku = serializers.CharField(read_only=True, allow_null=True)
    categoria_id = serializers.IntegerField(read_only=True, allow_null=True)
    categoria_nombre = serializers.CharField(read_only=True, allow_null=True)
    activo = serializers.BooleanField(read_only=True)
    unidad_id = serializers.IntegerField(read_only=True)
    costo_unitario_estimado = serializers.SerializerMethodField()
    politica_costeo = serializers.SerializerMethodField()
    tiene_movimientos = serializers.BooleanField(read_only=True)
    moneda = serializers.SerializerMethodField()
    def get_costo_unitario_estimado(self, obj):
        return decimal_string(weighted_cost(obj.compra_importe, obj.compra_cantidad))
    def get_politica_costeo(self, obj):
        return COST_POLICY
    def get_moneda(self, obj):
        return 'PEN'
    class Meta(StockOutput.Meta):
        fields = StockOutput.Meta.fields + ['tiene_movimientos', 'costo_unitario_estimado', 'politica_costeo', 'moneda', 'sku', 'categoria_id', 'categoria_nombre', 'activo', 'unidad_id']
        read_only_fields = fields


class RecipeUseOutput(serializers.ModelSerializer):
    servicio_nombre = serializers.CharField(source='servicio.nombre')
    unidad = serializers.CharField(source='articulo.unidad.codigo')
    class Meta:
        model = m.RecetasServicio
        fields = ['servicio_id','servicio_nombre','articulo_id','cantidad_estimada','unidad']
        read_only_fields = fields


class VencimientoOutput(DetalleOutput):
    compra_id = serializers.IntegerField(read_only=True)
    estado_alerta = serializers.SerializerMethodField()
    existencia_lote = serializers.SerializerMethodField()
    def get_estado_alerta(self, obj):
        return 'VENCIDO' if obj.vencimiento < timezone.localdate() else 'PROXIMO'
    def get_existencia_lote(self, obj):
        return None
    class Meta(DetalleOutput.Meta):
        fields = DetalleOutput.Meta.fields + ['compra_id', 'estado_alerta', 'existencia_lote']
        read_only_fields = fields

