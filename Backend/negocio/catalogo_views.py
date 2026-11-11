"""Read-only mappings of existing PostgreSQL views; no DDL or duplicate table models."""
from django.db import models


class ViewReadOnlyMixin:
    def save(self, *args, **kwargs):
        raise TypeError('SQL views are read-only in this application.')

    def delete(self, *args, **kwargs):
        raise TypeError('SQL views are read-only in this application.')


class VwCatalogoServicios(ViewReadOnlyMixin, models.Model):
    id = models.BigIntegerField(primary_key=True)
    slug = models.CharField(max_length=160, null=True)
    nombre = models.CharField(max_length=150)
    descripcion = models.TextField(null=True)
    duracion_minutos = models.IntegerField(null=True)
    precio_base = models.DecimalField(max_digits=12, decimal_places=2)
    reservable_online = models.BooleanField()
    requiere_anticipo = models.BooleanField()
    orden = models.IntegerField()
    categoria = models.CharField(max_length=100, null=True)
    imagen_principal = models.CharField(max_length=500, null=True)

    class Meta:
        managed = False
        db_table = 'vw_catalogo_servicios'


class VwCatalogoArticulos(ViewReadOnlyMixin, models.Model):
    id = models.BigIntegerField(primary_key=True)
    slug = models.CharField(max_length=180, null=True)
    nombre = models.CharField(max_length=160)
    descripcion = models.TextField(null=True)
    precio_venta = models.DecimalField(max_digits=12, decimal_places=2)
    orden = models.IntegerField()
    categoria = models.CharField(max_length=100, null=True)
    disponible = models.BooleanField()
    imagen_principal = models.CharField(max_length=500, null=True)

    class Meta:
        managed = False
        db_table = 'vw_catalogo_articulos'


class VwStockActual(ViewReadOnlyMixin, models.Model):
    articulo_id = models.BigIntegerField(primary_key=True)
    nombre = models.CharField(max_length=160)
    tipo = models.CharField(max_length=12)
    unidad = models.CharField(max_length=15)
    stock_minimo = models.DecimalField(max_digits=14, decimal_places=3)
    existencia = models.DecimalField(max_digits=14, decimal_places=3)
    bajo_minimo = models.BooleanField()

    class Meta:
        managed = False
        db_table = 'vw_stock_actual'

