from rest_framework.routers import SimpleRouter
from .views import VisitViewSet,SaleViewSet,PaymentViewSet,AdvanceViewSet,RefundViewSet,ReconciliationViewSet,IntentViewSet

router=SimpleRouter()
router.register('finanzas/intentos', IntentViewSet, basename='finanzas-intentos')
for prefix,view in [('visitas',VisitViewSet),('ventas',SaleViewSet),('pagos',PaymentViewSet),('anticipos',AdvanceViewSet),('reembolsos',RefundViewSet),('conciliaciones',ReconciliationViewSet)]:
    router.register(prefix,view,basename='finanzas-'+prefix)
urlpatterns=router.urls

