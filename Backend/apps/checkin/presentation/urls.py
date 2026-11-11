from django.urls import include, path
from rest_framework.routers import SimpleRouter
from .admin_views import PuntoViewSet, ArrivalViewSet
from .public_views import PublicCheckinView, DemoNoticeView

router = SimpleRouter()
router.register('puntos', PuntoViewSet, basename='checkin-puntos')
router.register('llegadas', ArrivalViewSet, basename='checkin-llegadas')
urlpatterns = [
    path('public/checkin/aviso-prueba/', DemoNoticeView.as_view(), name='checkin-aviso-prueba'),
    path('public/checkin/<uuid:token>/', PublicCheckinView.as_view(), name='checkin-public'),
    path('admin/checkin/', include(router.urls)),
]

