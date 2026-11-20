from rest_framework import serializers
from negocio import models as m
from apps.catalogo.media import public_image_url


class CategoriaServicioOutput(serializers.ModelSerializer):
    class Meta:
        model = m.CategoriasServicio
        fields = ['id', 'nombre', 'orden', 'activa']
        read_only_fields = fields


class CategoriaArticuloOutput(serializers.ModelSerializer):
    class Meta:
        model = m.CategoriasArticulo
        fields = ['id', 'nombre']
        read_only_fields = fields


class UnidadOutput(serializers.ModelSerializer):
    class Meta:
        model = m.UnidadesMedida
        fields = ['id', 'codigo', 'nombre']
        read_only_fields = fields


class ServicioOutput(serializers.ModelSerializer):
    profesionales_ids = serializers.SerializerMethodField()

    def get_profesionales_ids(self, obj):
        return sorted(row.profesional_id for row in obj.profesionalservicios_set.all())

    categoria_nombre = serializers.CharField(source='categoria.nombre', default=None)
    imagen_principal = serializers.SerializerMethodField()

    def get_imagen_principal(self, obj):
        if hasattr(obj, 'foto_principal'):
            return public_image_url(obj.foto_principal)
        url = m.ImagenesCatalogo.objects.filter(servicio_id=obj.pk).order_by(
            '-es_principal', 'orden', 'id').values_list('url', flat=True).first()
        return public_image_url(url)
    class Meta:
        model = m.Servicios
        fields = ['id', 'categoria_id', 'categoria_nombre', 'nombre', 'slug', 'descripcion',
                  'duracion_minutos', 'precio_base', 'visible_catalogo', 'reservable_online',
                  'requiere_anticipo', 'orden', 'activo', 'creado_en', 'actualizado_en', 'imagen_principal', 'profesionales_ids']
        read_only_fields = fields


class ArticuloOutput(serializers.ModelSerializer):
    categoria_nombre = serializers.CharField(source='categoria.nombre', default=None)
    unidad_codigo = serializers.CharField(source='unidad.codigo')
    class Meta:
        model = m.Articulos
        fields = ['id', 'categoria_id', 'categoria_nombre', 'unidad_id', 'unidad_codigo', 'nombre',
                  'slug', 'descripcion', 'sku', 'tipo', 'precio_venta', 'stock_minimo',
                  'visible_catalogo', 'orden', 'activo', 'creado_en', 'actualizado_en']
        read_only_fields = fields


class ImagenOutput(serializers.ModelSerializer):
    class Meta:
        model = m.ImagenesCatalogo
        fields = ['id', 'servicio_id', 'articulo_id', 'url', 'texto_alt', 'orden', 'es_principal', 'creado_en']
        read_only_fields = fields


class InsumoOutput(serializers.ModelSerializer):
    nombre = serializers.CharField(source='articulo.nombre')
    unidad = serializers.CharField(source='articulo.unidad.codigo')
    activo = serializers.BooleanField(source='articulo.activo')
    class Meta:
        model = m.RecetasServicio
        fields = ['articulo_id', 'nombre', 'unidad', 'activo', 'cantidad_estimada']
        read_only_fields = fields


class PublicImageMixin:
    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['imagen_principal'] = public_image_url(data['imagen_principal'])
        data['moneda'] = 'PEN'
        return data


class ServicioPublicOutput(PublicImageMixin, serializers.ModelSerializer):
    class Meta:
        model = m.VwCatalogoServicios
        fields = ['id', 'slug', 'nombre', 'descripcion', 'duracion_minutos', 'precio_base',
                  'reservable_online', 'requiere_anticipo', 'orden', 'categoria', 'imagen_principal']
        read_only_fields = fields


class ProductoPublicOutput(PublicImageMixin, serializers.ModelSerializer):
    class Meta:
        model = m.VwCatalogoArticulos
        fields = ['id', 'slug', 'nombre', 'descripcion', 'precio_venta', 'orden', 'categoria',
                  'disponible', 'imagen_principal']
        read_only_fields = fields


class StockOutput(serializers.ModelSerializer):
    class Meta:
        model = m.VwStockActual
        fields = ['articulo_id', 'nombre', 'tipo', 'unidad', 'stock_minimo', 'existencia', 'bajo_minimo']
        read_only_fields = fields

