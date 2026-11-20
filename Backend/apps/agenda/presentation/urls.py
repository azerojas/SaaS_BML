from django.urls import path,include
from rest_framework.routers import SimpleRouter
from .views import ProfessionalView,ScheduleView,BlockView,AppointmentView,WaitView,CalendarView,PublicView
from .public_views import CustomerBookingView, StaffBookingRequestsView
from .daily_views import DailyScheduleView

router=SimpleRouter()
router.register('disponibilidad-diaria',DailyScheduleView,basename='agenda-disponibilidad-diaria')
router.register('solicitudes', StaffBookingRequestsView, basename='agenda-solicitudes')
from .intent_views import IntentView
router.register('intentos', IntentView, basename='agenda-intentos')
for prefix,view in [('profesionales',ProfessionalView),('horarios',ScheduleView),('bloqueos',BlockView),('citas',AppointmentView),('lista-espera',WaitView),('calendario',CalendarView)]:
    router.register(prefix,view,basename='agenda-'+prefix)
urlpatterns=[path('agenda/',include(router.urls))]+[
    path('public/agenda/'+resource+'/',PublicView.as_view(resource=resource),name='public-agenda-'+resource)
    for resource in ['profesionales','servicios','disponibilidad']]
urlpatterns += [path('public/reservas/'+resource+'/', CustomerBookingView.as_view(resource=resource), name='public-booking-'+resource)
    for resource in ['configuracion', 'acceso', 'salir', 'solicitudes']]
urlpatterns += [path('public/reservas/solicitudes/<uuid:pk>/', CustomerBookingView.as_view(resource='detalle'), name='public-booking-detail')]
urlpatterns += [path('public/reservas/intentos/<uuid:key>/', CustomerBookingView.as_view(resource='intentos'), name='public-booking-intent')]
urlpatterns += [path('public/reservas/solicitudes/<uuid:pk>/'+resource+'/', CustomerBookingView.as_view(resource=resource), name='public-booking-'+resource)
    for resource in ['cancelar', 'reprogramar', 'disponibilidad']]
