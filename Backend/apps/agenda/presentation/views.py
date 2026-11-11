from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import mixins,viewsets
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from apps.catalogo.pagination import CatalogPagination
from apps.finanzas.infrastructure.idempotency import canonical
from apps.finanzas.domain.errors import FinanceError
from apps.agenda.infrastructure.transactions import ensure_ready,execute
from apps.agenda.domain.errors import AgendaError
from apps.agenda.domain.commands import BookingCommand,AvailabilityQuery
from apps.agenda.application import administration,bookings,expiry,availability,waitlist,selectors
from apps.agenda.infrastructure import repositories as repo
from negocio import models as m
from .permissions import AgendaPermission
from . import serializers as s


class ErrorMixin:
    def handle_exception(self,exc):
        if isinstance(exc,(AgendaError,FinanceError)):
            return Response({'code':exc.code,'detail':exc.detail},status={'conflict':409,'invalid':400,'forbidden':403,'not_found':404,'unavailable':503}[exc.kind])
        return super().handle_exception(exc)


class BaseView(ErrorMixin,viewsets.GenericViewSet):
    permission_classes=[AgendaPermission]
    pagination_class=CatalogPagination
    lookup_value_regex='[0-9]+'
    http_method_names=['get','post','put','patch','delete','head','options']
    action_permissions={}
    kind=None
    def initial(self,request,*args,**kwargs):
        super().initial(request,*args,**kwargs)
        ensure_ready()
        if any(len(request.query_params.getlist(key))!=1 for key in request.query_params):raise ValidationError('No repitas filtros.')
    def get_queryset(self):return selectors.list_rows(self.kind,self.request.query_params if self.action=='list' else {})
    def parse(self,cls,partial=False):
        serializer=cls(data=self.request.data,partial=partial)
        serializer.is_valid(raise_exception=True)
        return serializer.validated_data
    def mutate(self,name,target,data,callback,status=200):
        body,http=execute(name,self.request.headers.get('Idempotency-Key'),{'target':str(target) if target else None,'data':data},self.request.user,callback,status)
        return Response(body,status=http)


class ProfessionalView(mixins.ListModelMixin,mixins.RetrieveModelMixin,BaseView):
    kind='profesionales'
    serializer_class=s.ProfessionalOutput
    action_permissions={'create':'manage_professionals','partial_update':'manage_professionals','especialidades':'manage_professionals'}
    def create(self,request):
        data=self.parse(s.ProfessionalInput)
        return self.mutate('profesional.crear',None,data,lambda key:administration.professional(data,request.user),201)
    def partial_update(self,request,pk=None):
        data=self.parse(s.ProfessionalInput,True)
        return self.mutate('profesional.editar',pk,data,lambda key:administration.professional(data,request.user,pk))
    @action(detail=True,methods=['get','put'])
    def especialidades(self,request,pk=None):
        if request.method=='GET':
            self.get_object()
            return Response({'profesional_id':int(pk),'servicios':list(m.ProfesionalServicios.objects.filter(profesional_id=pk).order_by('servicio_id').values_list('servicio_id',flat=True))})
        data=self.parse(s.SpecialtiesInput)
        return self.mutate('profesional.especialidades',pk,data,lambda key:administration.specialties(pk,data['servicios'],request.user))


class ScheduleView(mixins.ListModelMixin,mixins.RetrieveModelMixin,BaseView):
    kind='horarios'
    serializer_class=s.ScheduleOutput
    action_permissions={'create':'manage_schedules','partial_update':'manage_schedules','destroy':'manage_schedules'}
    def create(self,request):
        data=self.parse(s.ScheduleInput)
        return self.mutate('horario.crear',None,data,lambda key:administration.schedule(data,request.user),201)
    def partial_update(self,request,pk=None):
        data=self.parse(s.ScheduleInput,True)
        if 'profesional_id' in data:raise ValidationError('No se cambia el profesional del horario existente.')
        return self.mutate('horario.editar',pk,data,lambda key:administration.schedule(data,request.user,pk))
    def destroy(self,request,pk=None):
        data=self.parse(s.RetireInput)
        return self.mutate('horario.retirar',pk,data,lambda key:administration.schedule({},request.user,pk,True,data['motivo']))


class BlockView(mixins.ListModelMixin,mixins.RetrieveModelMixin,BaseView):
    kind='bloqueos'
    serializer_class=s.BlockOutput
    action_permissions={'create':'manage_blocks','partial_update':'manage_blocks','destroy':'manage_blocks'}
    def create(self,request):
        data=self.parse(s.BlockInput)
        return self.mutate('bloqueo.crear',None,data,lambda key:administration.block(data,request.user),201)
    def partial_update(self,request,pk=None):
        data=self.parse(s.BlockInput,True)
        return self.mutate('bloqueo.editar',pk,data,lambda key:administration.block(data,request.user,pk))
    def destroy(self,request,pk=None):
        data=self.parse(s.RetireInput)
        return self.mutate('bloqueo.retirar',pk,data,lambda key:administration.block({},request.user,pk,True,data['motivo']))


class AppointmentView(mixins.ListModelMixin,BaseView):
    kind='citas'
    serializer_class=s.AppointmentOutput
    action_permissions={key:'manage_appointments' for key in ['create','reprogramar','cancelar','confirmar','completar','no_asistio','expirar']}
    action_permissions['vincular_llegada']='link_arrivals'
    def retrieve(self,request,pk=None):
        obj,extra=selectors.detail(pk)
        return Response(canonical({**s.AppointmentOutput(obj).data,**extra,'servicios':s.AppointmentServiceOutput(obj.citaservicios_set.all(),many=True).data}))
    def create(self,request):
        data=self.parse(s.BookingInput)
        return self.mutate('cita.crear',None,data,lambda key:bookings.create(BookingCommand(**{**data,'servicios':tuple(data['servicios'])}),request.user),201)
    @action(detail=True,methods=['post'])
    def reprogramar(self,request,pk=None):
        data=self.parse(s.RescheduleInput)
        return self.mutate('cita.reprogramar',pk,data,lambda key:bookings.reschedule(pk,data,request.user))
    @action(detail=True,methods=['post'])
    def cancelar(self,request,pk=None):return self.resolve_action('cancelar',s.CancelInput,pk)
    @action(detail=True,methods=['post'])
    def confirmar(self,request,pk=None):return self.resolve_action('confirmar',s.StrictInput,pk)
    @action(detail=True,methods=['post'])
    def completar(self,request,pk=None):return self.resolve_action('completar',s.StrictInput,pk)
    @action(detail=True,methods=['post'],url_path='no-asistio')
    def no_asistio(self,request,pk=None):return self.resolve_action('no-asistio',s.Reason,pk)
    def resolve_action(self,name,cls,pk):
        data=self.parse(cls)
        return self.mutate('cita.'+name,pk,data,lambda key:bookings.resolve(pk,name,data,self.request.user))
    @action(detail=True,methods=['post'],url_path='vincular-llegada')
    def vincular_llegada(self,request,pk=None):
        data=self.parse(s.LinkInput)
        return self.mutate('cita.llegada',pk,data,lambda key:bookings.link_arrival(pk,data['llegada_id'],request.user))
    @action(detail=False,methods=['post'])
    def expirar(self,request):
        data=self.parse(s.StrictInput)
        return self.mutate('cita.expirar',None,data,lambda key:expiry.expire_locked(request.user))


class WaitView(mixins.ListModelMixin,mixins.RetrieveModelMixin,BaseView):
    kind='lista-espera'
    serializer_class=s.WaitOutput
    action_permissions={key:'manage_waitlist' for key in ['create','cancelar','oferta_manual','convertir']}
    def create(self,request):
        data=self.parse(s.WaitInput)
        return self.mutate('espera.crear',None,data,lambda key:waitlist.save(data,request.user),201)
    def retrieve(self,request,pk=None):
        obj=self.get_object()
        converted=m.Auditoria.objects.filter(entidad='lista_espera',entidad_id=str(pk),accion='CONVERTIR_ESPERA').order_by('-id').values_list('datos',flat=True).first()
        return Response({**s.WaitOutput(obj).data,'cita_id':converted.get('cita_id') if converted else None})
    @action(detail=True,methods=['post'])
    def cancelar(self,request,pk=None):return self.resolve_action('cancelar',s.Reason,pk)
    @action(detail=True,methods=['post'],url_path='oferta-manual')
    def oferta_manual(self,request,pk=None):return self.resolve_action('oferta-manual',s.OfferInput,pk)
    @action(detail=True,methods=['post'])
    def convertir(self,request,pk=None):
        if not request.user.has_perm('agenda.manage_appointments'):raise AgendaError('BOOKING_PERMISSION_REQUIRED','Convertir requiere tambien permiso de gestionar citas.','forbidden')
        return self.resolve_action('convertir',s.ConvertInput,pk)
    def resolve_action(self,name,cls,pk):
        data=self.parse(cls)
        return self.mutate('espera.'+name,pk,data,lambda key:waitlist.resolve(pk,name,data,self.request.user),201 if name=='convertir' else 200)


def availability_input(params,public=False):
    if set(params)!={'fecha','profesional_id','servicios'} or any(len(params.getlist(key))!=1 for key in params):raise ValidationError('Usa fecha, profesional_id y servicios=1,2 sin filtros adicionales.')
    serializer=s.AvailabilityInput(data={'fecha':params['fecha'],'profesional_id':params['profesional_id'],'servicios':params['servicios'].split(',')})
    serializer.is_valid(raise_exception=True)
    return AvailabilityQuery(**{**serializer.validated_data,'servicios':tuple(serializer.validated_data['servicios']),'public':public})


class CalendarView(BaseView):
    action_permissions={'configuracion':'configure_agenda'}
    def list(self,request):
        if not {'desde','hasta'}<=set(request.query_params):raise ValidationError('Calendario requiere desde y hasta exclusiva, maximo93 dias.')
        self.kind='citas'
        rows=self.paginate_queryset(self.get_queryset())
        return self.get_paginated_response(s.AppointmentOutput(rows,many=True).data)
    @action(detail=False,methods=['get'])
    def disponibilidad(self,request):return Response(canonical(availability.available(availability_input(request.query_params))))
    @action(detail=False,methods=['get','patch'])
    def configuracion(self,request):
        if request.method=='GET':
            obj=repo.config()
            return Response(canonical({key:getattr(obj,key) for key in s.ConfigInput().fields}))
        if not request.user.has_perm('agenda.configure_agenda'):raise AgendaError('CONFIG_FORBIDDEN','Falta permiso de configuracion.','forbidden')
        data=self.parse(s.ConfigInput)
        return self.mutate('configurar',1,data,lambda key:administration.configure(data,request.user))


class PublicView(ErrorMixin,APIView):
    permission_classes=[AllowAny]
    authentication_classes=[]
    http_method_names=['get','head','options']
    resource=None
    def get(self,request):
        ensure_ready()
        from apps.checkin.infrastructure.abuse_protection import consume
        consume([('agenda-ip-minute',request.META.get('REMOTE_ADDR','unknown'),settings.AGENDA_PUBLIC_REQUEST_LIMIT,60)])
        if not settings.AGENDA_PUBLIC_READ_ENABLED or not repo.config().reservas_online_activas:
            raise AgendaError('BOOKING_NOT_AVAILABLE','Consulta no disponible.','not_found')
        if self.resource=='disponibilidad':return Response(canonical(availability.available(availability_input(request.query_params,True))))
        if request.query_params:raise ValidationError('Esta lista publica no admite filtros personales.')
        if self.resource=='profesionales':
            rows=list(m.Profesionales.objects.filter(activa=True,visible_reservas=True).order_by('apellidos','nombres','id').values('id','nombres','apellidos')[:101])
        else:
            rows=list(m.Servicios.objects.filter(activo=True,visible_catalogo=True,reservable_online=True).order_by('orden','id').values('id','nombre','duracion_minutos','precio_base')[:101])
        if len(rows)>100:raise AgendaError('PUBLIC_LIST_LIMIT','Listado publico excede100 registros; requiere paginacion revisada.','unavailable')
        return Response(canonical({'timezone':'America/Lima','results':rows,'reserva_publica_habilitada':False}))
