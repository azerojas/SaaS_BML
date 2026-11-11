from django.urls import path,include
from rest_framework.routers import SimpleRouter
from .views import ProfessionalView,ScheduleView,BlockView,AppointmentView,WaitView,CalendarView,PublicView

router=SimpleRouter()
for prefix,view in [('profesionales',ProfessionalView),('horarios',ScheduleView),('bloqueos',BlockView),('citas',AppointmentView),('lista-espera',WaitView),('calendario',CalendarView)]:
    router.register(prefix,view,basename='agenda-'+prefix)
urlpatterns=[path('agenda/',include(router.urls))]+[
    path('public/agenda/'+resource+'/',PublicView.as_view(resource=resource),name='public-agenda-'+resource)
    for resource in ['profesionales','servicios','disponibilidad']]
