import re
from decimal import Decimal
from rest_framework import serializers
from apps.clientas.serializers import StrictInputMixin
from apps.catalogo.media import validate_image_url


class NameField(serializers.CharField):
    def to_internal_value(self, data):
        value = ' '.join(super().to_internal_value(data).split())
        if not value:
            self.fail('blank')
        return value


class NormalizedCodeField(serializers.CharField):
    def to_internal_value(self, data):
        value = super().to_internal_value(data).upper()
        if not re.fullmatch(r'[A-Z0-9][A-Z0-9._-]*', value):
            raise serializers.ValidationError('Usa letras ASCII, numeros, puntos, guiones o guion bajo, sin espacios.')
        return value


class SlugField(serializers.SlugField):
    def to_internal_value(self, data):
        return super().to_internal_value(data).lower()


class InputSerializer(StrictInputMixin, serializers.Serializer):
    pass


class CategoriaServicioInput(InputSerializer):
    nombre = NameField(max_length=100)
    orden = serializers.IntegerField(required=False, min_value=0, max_value=2147483647)
    activa = serializers.BooleanField(required=False)


class CategoriaArticuloInput(InputSerializer):
    nombre = NameField(max_length=100)


class UnidadInput(InputSerializer):
    codigo = NormalizedCodeField(max_length=15)
    nombre = NameField(max_length=60)


class ServicioInput(InputSerializer):
    categoria_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    nombre = NameField(max_length=150)
    slug = SlugField(max_length=160, required=False)
    descripcion = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=20000)
    duracion_minutos = serializers.IntegerField(min_value=1, max_value=2147483647, required=False, allow_null=True)
    precio_base = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'))
    visible_catalogo = serializers.BooleanField(required=False)
    reservable_online = serializers.BooleanField(required=False)
    requiere_anticipo = serializers.BooleanField(required=False)
    orden = serializers.IntegerField(min_value=0, max_value=2147483647, required=False)
    activo = serializers.BooleanField(required=False)


class ArticuloInput(InputSerializer):
    categoria_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    unidad_id = serializers.IntegerField(min_value=1)
    nombre = NameField(max_length=160)
    slug = SlugField(max_length=180, required=False)
    descripcion = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=20000)
    sku = NormalizedCodeField(max_length=45, required=False, allow_null=True)
    tipo = serializers.ChoiceField(choices=['INSUMO', 'VENTA', 'AMBOS'])
    precio_venta = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'), required=False)
    stock_minimo = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=Decimal('0'), required=False)
    visible_catalogo = serializers.BooleanField(required=False)
    orden = serializers.IntegerField(min_value=0, max_value=2147483647, required=False)
    activo = serializers.BooleanField(required=False)


class InsumoInput(InputSerializer):
    articulo_id = serializers.IntegerField(min_value=1)
    cantidad_estimada = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=Decimal('0.001'))


class RecetaInput(InputSerializer):
    insumos = InsumoInput(many=True, max_length=200)


class ImagenInput(InputSerializer):
    url = serializers.URLField(max_length=500)
    texto_alt = serializers.CharField(max_length=200, required=False, allow_null=True, allow_blank=True)
    orden = serializers.IntegerField(required=False, min_value=0, max_value=2147483647)
    es_principal = serializers.BooleanField(required=False)

    def validate_url(self, value):
        return validate_image_url(value)


class ImagenEditInput(InputSerializer):
    url = serializers.URLField(max_length=500, required=False)
    texto_alt = serializers.CharField(max_length=200, required=False, allow_null=True, allow_blank=True)
    orden = serializers.IntegerField(required=False, min_value=0, max_value=2147483647)

    def validate_url(self, value):
        return validate_image_url(value)

