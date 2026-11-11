from django.urls import path
from rest_framework.routers import SimpleRouter
from . import views

router = SimpleRouter()
for name, view in [('proveedores', views.ProveedorViewSet), ('compras', views.CompraViewSet),
                   ('inventario/stock', views.StockViewSet), ('inventario/movimientos', views.MovimientoViewSet),
                   ('inventario/ajustes', views.AjusteViewSet), ('inventario/alertas', views.AlertaViewSet)]:
    router.register(name, view, basename='inventario-' + name.replace('/', '-'))
urlpatterns = router.urls + [
    path('inventario/costos-receta/<int:pk>/', views.CostoRecetaViewSet.as_view({'get': 'retrieve'}), name='inventario-costo-receta'),
]

