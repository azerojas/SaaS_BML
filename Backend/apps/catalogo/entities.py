from negocio import models as m
from . import serializers as s

ENTITIES = {
    'categorias-servicio': (m.CategoriasServicio, s.CategoriaServicioInput, s.CategoriaServicioOutput),
    'categorias-articulo': (m.CategoriasArticulo, s.CategoriaArticuloInput, s.CategoriaArticuloOutput),
    'unidades': (m.UnidadesMedida, s.UnidadInput, s.UnidadOutput),
    'servicios': (m.Servicios, s.ServicioInput, s.ServicioOutput),
    'articulos': (m.Articulos, s.ArticuloInput, s.ArticuloOutput),
}

