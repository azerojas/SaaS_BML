from datetime import datetime,timedelta
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db.models import Q
from negocio import models as m
from apps.checkin.application.selectors import provisional
from apps.finanzas.application.audit import record
from apps.agenda.domain.errors import AgendaError
from apps.agenda.domain.rules import ZONE
from apps.agenda.domain.commands import BookingCommand
from apps.agenda.infrastructure import repositories as repo
from . import bookings


def save(data,actor):
    client=get_object_or_404(m.Clientas.objects.select_for_update(),pk=data['clienta_id'],activa=True)
    if provisional(client):raise AgendaError('CLIENT_NOT_VERIFIED','Ficha no validada.')
    service=get_object_or_404(m.Servicios,pk=data['servicio_id'],activo=True)
    if not service.duracion_minutos:raise AgendaError('INVALID_DURATION','El servicio necesita duracion.')
    if data.get('profesional_id'):repo.eligible(data['profesional_id'],(service.pk,))
    today=timezone.now().astimezone(ZONE).date()
    if not today<=data['fecha_deseada']<=today+timedelta(days=min(repo.config().anticipacion_maxima_dias,366)):
        raise AgendaError('WAITLIST_DATE_INVALID','Fecha de espera fuera del horizonte.','invalid')
    begin,end=data.get('franja_inicio'),data.get('franja_fin')
    if (begin is None)!=(end is None) or begin and begin>=end:
        raise AgendaError('INVALID_WAITLIST_WINDOW','Franja requiere ambos extremos y no cruza medianoche.','invalid')
    if begin and datetime.combine(data['fecha_deseada'],end)-datetime.combine(data['fecha_deseada'],begin)<timedelta(minutes=service.duracion_minutos):
        raise AgendaError('INVALID_WAITLIST_WINDOW','La franja es menor que la duracion del servicio.','invalid')
    qs=m.ListaEspera.objects.filter(clienta_id=client.pk,servicio_id=service.pk,fecha_deseada=data['fecha_deseada'],estado__in=['ACTIVA','NOTIFICADA'])
    if data.get('profesional_id'):qs=qs.filter(Q(profesional_id=None)|Q(profesional_id=data['profesional_id']))
    if begin:qs=qs.filter(Q(franja_inicio=None)|Q(franja_inicio__lt=end,franja_fin__gt=begin))
    if qs.exists():raise AgendaError('DUPLICATE_WAITLIST','Ya existe una solicitud compatible con esa fecha/franja.')
    if m.ListaEspera.objects.filter(clienta_id=client.pk,estado__in=['ACTIVA','NOTIFICADA']).count()>=20:
        raise AgendaError('WAITLIST_LIMIT','Maximo20 solicitudes de espera activas por clienta.')
    obj=m.ListaEspera.objects.create(**data)
    record(actor,obj,'CREAR_ESPERA',{'servicio_id':service.pk})
    return {'espera_id':obj.pk,'estado':obj.estado}


def resolve(pk,action,data,actor):
    obj=get_object_or_404(m.ListaEspera.objects.select_for_update(),pk=pk)
    if obj.estado not in ('ACTIVA','NOTIFICADA'):raise AgendaError('WAITLIST_RESOLVED','La solicitud de espera ya esta resuelta.')
    if action=='convertir':
        start=data['inicio_en'].astimezone(ZONE)
        professional=data.get('profesional_id',obj.profesional_id)
        if not professional or obj.profesional_id and obj.profesional_id!=professional:
            raise AgendaError('WAITLIST_PROFESSIONAL_MISMATCH','Selecciona el profesional compatible con la solicitud.','invalid')
        service=get_object_or_404(m.Servicios,pk=obj.servicio_id,activo=True)
        if not service.duracion_minutos:raise AgendaError('INVALID_DURATION','Servicio sin duracion.')
        end=start+timedelta(minutes=service.duracion_minutos)
        if start.date()!=obj.fecha_deseada or obj.franja_inicio and not (obj.franja_inicio<=start.time()<end.time()<=obj.franja_fin and end.date()==start.date()):
            raise AgendaError('WAITLIST_WINDOW_MISMATCH','La cita debe caber en fecha/franja solicitada.','invalid')
        created=bookings.create(BookingCommand(obj.clienta_id,professional,(obj.servicio_id,),start),actor)
        obj.estado='CONVERTIDA'
        obj.save(update_fields=['estado'])
        record(actor,obj,'CONVERTIR_ESPERA',{'cita_id':created['cita_id']})
        return {'espera_id':obj.pk,**created}
    if action=='oferta-manual':
        if obj.estado!='ACTIVA' or data['oferta_registrada_manualmente'] is not True:
            raise AgendaError('MANUAL_OFFER_REQUIRED','Registra una oferta manual real; no se envia mensaje.','invalid')
        obj.estado='NOTIFICADA'
    else:obj.estado='CANCELADA'
    obj.save(update_fields=['estado'])
    record(actor,obj,'RESOLVER_ESPERA',{'estado':obj.estado,'motivo':data.get('motivo',''),'mensaje_enviado':False})
    return {'espera_id':obj.pk,'estado':obj.estado}
