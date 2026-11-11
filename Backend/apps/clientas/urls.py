from rest_framework.routers import SimpleRouter
from .views import ClientaViewSet

router = SimpleRouter()
router.register('clientas', ClientaViewSet, basename='clientas')
urlpatterns = router.urls

