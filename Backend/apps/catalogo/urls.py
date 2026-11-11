from rest_framework.routers import SimpleRouter
from . import views

admin_router = SimpleRouter()
for prefix, view in [
    ('categorias-servicio', views.CategoriaServicioViewSet),
    ('categorias-articulo', views.CategoriaArticuloViewSet),
    ('unidades', views.UnidadViewSet),
    ('servicios', views.ServicioViewSet),
    ('articulos', views.ArticuloViewSet),
    ('imagenes', views.ImagenViewSet),
    ('stock', views.StockViewSet),
]:
    admin_router.register(prefix, view, basename='catalogo-admin-' + prefix)

public_router = SimpleRouter()
public_router.register('servicios', views.PublicCatalogViewSet, basename='catalogo-servicios')
public_router.register('productos', views.PublicProductViewSet, basename='catalogo-productos')
public_router.register('categorias', views.PublicCategoryViewSet, basename='catalogo-categorias')

