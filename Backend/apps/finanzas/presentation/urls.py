from rest_framework.routers import SimpleRouter
from .views import VisitViewSet,SaleViewSet,PaymentViewSet,AdvanceViewSet,RefundViewSet,ReconciliationViewSet

router=SimpleRouter()
for prefix,view in [('visitas',VisitViewSet),('ventas',SaleViewSet),('pagos',PaymentViewSet),('anticipos',AdvanceViewSet),('reembolsos',RefundViewSet),('conciliaciones',ReconciliationViewSet)]:
    router.register(prefix,view,basename='finanzas-'+prefix)
urlpatterns=router.urls

