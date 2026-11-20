from datetime import timedelta
from django.shortcuts import get_object_or_404
from django.utils import timezone
from negocio import models as m
from apps.checkin.application import commands as checkin
from apps.checkin.application.selectors import provisional
from apps.finanzas.application.audit import record
from apps.agenda.domain.errors import AgendaError
from apps.agenda.domain.rules import ACTIVE,ZONE,amounts,horizon,published_window
from apps.agenda.infrastructure import repositories as repo
from .common import deposited,set_state,annotate_history
from .expiry import expire_locked


def validate_slot(professional_id,client_id,start,end,cfg,exclude=None):
    horizon(start,cfg,timezone.now())
    window=published_window(start,end,repo.booking_windows(professional_id,start.astimezone(ZONE).date()),cfg.intervalo_slots_minutos)
    if window is None:
        raise AgendaError('SLOT_NOT_AVAILABLE','El intervalo no pertenece al horario/alineacion de slots.')
    if repo.collision(professional_id,*window,client_id,exclude,client_interval=(start,end)):
        raise AgendaError('SLOT_NOT_AVAILABLE','El intervalo ya no esta disponible.')


def create(command,actor,*,public=False,quote=None):
    if command.origen not in (('ONLINE',) if public else ('MANUAL','TELEFONO')):
        raise AgendaError('CHANNEL_NOT_ENABLED','Solo reservas privadas MANUAL/TELEFONO; sin WhatsApp ni alta publica.','invalid')
    expire_locked(actor)
    cfg=repo.config(lock=True)
    client=get_object_or_404(m.Clientas.objects.select_for_update(),pk=command.clienta_id,activa=True)
    if provisional(client):raise AgendaError('CLIENT_NOT_VERIFIED','La ficha QR debe validarse antes de reservar.')
    _,services=repo.eligible(command.profesional_id,command.servicios,public=public)
    if quote is not None:
        snapshots={item['servicio_id']:item for item in quote}
        for service in services:
            from decimal import Decimal
            service.precio_base=Decimal(snapshots[service.pk]['precio_snapshot'])
            service.duracion_minutos=snapshots[service.pk]['duracion_minutos']
            service.requiere_anticipo=False
    total,duration,required=amounts(services,cfg)
    end=command.inicio_en+timedelta(minutes=duration)
    validate_slot(command.profesional_id,client.pk,command.inicio_en,end,cfg)
    if m.Citas.objects.filter(clienta_id=client.pk,estado__in=ACTIVE,fin_en__gt=timezone.now()).count()>=cfg.max_citas_activas_por_clienta:
        raise AgendaError('CLIENT_BOOKING_LIMIT','Se alcanzo el limite de citas activas por clienta.')
    now=timezone.now()
    obj=m.Citas.objects.create(clienta_id=client.pk,profesional_id=command.profesional_id,origen=command.origen,
        estado='PENDIENTE_PAGO' if required else 'PROGRAMADA',inicio_en=command.inicio_en,fin_en=end,duracion_total_minutos=duration,
        precio_total=total,anticipo_requerido=required,expira_en=now+timedelta(minutes=cfg.minutos_expiracion_pago) if required else None,
        notas=command.notas,creada_por_id=actor.pk if actor else None)
    m.CitaServicios.objects.bulk_create([m.CitaServicios(cita_id=obj.pk,servicio_id=row.pk,orden=index+1,
        duracion_minutos=row.duracion_minutos,precio_snapshot=row.precio_base) for index,row in enumerate(services)])
    annotate_history(obj,actor,'Reserva privada con precios/duracion del servidor.')
    from .common import system_audit
    (lambda action,data:record(actor,obj,action,data) if actor else system_audit(obj,action,data))(
        'CREAR_CITA_AGENDA',{'servicios':list(command.servicios),'anticipo_requerido':str(required),'canal':command.origen})
    return result(obj)


def result(obj):
    return {'cita_id':obj.pk,'estado':obj.estado,'inicio_en':obj.inicio_en,'fin_en':obj.fin_en,
            'precio_total':obj.precio_total,'anticipo_requerido':obj.anticipo_requerido,'expira_en':obj.expira_en}


def editable(pk):
    obj=get_object_or_404(m.Citas.objects.select_for_update(),pk=pk)
    if obj.estado not in ACTIVE or obj.visita_id is not None:
        raise AgendaError('APPOINTMENT_NOT_EDITABLE','Solo citas activas sin atencion vinculada admiten cambios.')
    if obj.estado=='PENDIENTE_PAGO' and obj.expira_en<=timezone.now():
        raise AgendaError('BOOKING_EXPIRED','La reserva vencio; ejecuta expiracion antes de operar.')
    return obj


def reschedule(pk,data,actor):
    obj=editable(pk)
    if obj.inicio_en<=timezone.now():raise AgendaError('RESCHEDULE_TOO_LATE','No se reprograman citas ya iniciadas.')
    cfg=repo.config(lock=True)
    old={'profesional_id':obj.profesional_id,'inicio_en':obj.inicio_en.isoformat(),'fin_en':obj.fin_en.isoformat(),
         'servicios':list(m.CitaServicios.objects.filter(cita_id=pk).order_by('orden').values('servicio_id','duracion_minutos','precio_snapshot'))}
    professional_id=data.get('profesional_id',obj.profesional_id)
    ids=tuple(data.get('servicios',[row['servicio_id'] for row in old['servicios']]))
    _,services=repo.eligible(professional_id,ids)
    if 'servicios' in data:
        total,duration,required=amounts(services,cfg)
    else:total,duration,required=obj.precio_total,obj.duracion_total_minutos,obj.anticipo_requerido
    if not duration or duration<=0:raise AgendaError('LEGACY_SNAPSHOT_MISSING','La cita no tiene duracion historica verificable.')
    received=deposited(pk)
    if received>total:raise AgendaError('DEPOSIT_EXCEEDS_NEW_PRICE','El nuevo precio seria inferior al anticipo; requiere conciliacion.')
    start=data['inicio_en']
    end=start+timedelta(minutes=duration)
    validate_slot(professional_id,obj.clienta_id,start,end,cfg,exclude=pk)
    obj.profesional_id,obj.inicio_en,obj.fin_en=professional_id,start,end
    obj.precio_total,obj.duracion_total_minutos,obj.anticipo_requerido=total,duration,required
    if required>received:
        if obj.estado!='PENDIENTE_PAGO':
            obj.expira_en=timezone.now()+timedelta(minutes=cfg.minutos_expiracion_pago)
            set_state(obj,'PENDIENTE_PAGO',actor,'Reprogramacion requiere anticipo adicional.')
    elif obj.estado=='PENDIENTE_PAGO':set_state(obj,'PROGRAMADA',actor,'Anticipo suficiente tras reprogramacion.')
    obj.save()
    if 'servicios' in data:
        m.CitaServicios.objects.filter(cita_id=pk).delete()
        m.CitaServicios.objects.bulk_create([m.CitaServicios(cita=obj,servicio=row,orden=index+1,duracion_minutos=row.duracion_minutos,precio_snapshot=row.precio_base) for index,row in enumerate(services)])
    from apps.finanzas.infrastructure.idempotency import canonical
    record(actor,obj,'REPROGRAMAR_CITA',{'anterior':canonical(old),'nuevo':canonical({'profesional_id':professional_id,'inicio_en':start,'fin_en':end,
        'servicios':list(m.CitaServicios.objects.filter(cita_id=pk).order_by('orden').values('servicio_id','duracion_minutos','precio_snapshot'))}),'motivo':data['motivo']})
    return result(obj)


def resolve(pk,action,data,actor):
    obj=get_object_or_404(m.Citas.objects.select_for_update(),pk=pk)
    if action=='completar':
        visit=get_object_or_404(m.Visitas,pk=obj.visita_id) if obj.visita_id else None
        if visit is None or visit.clienta_id!=obj.clienta_id or visit.estado!='FINALIZADA' or not m.Ventas.objects.filter(visita_id=visit.pk,clienta_id=obj.clienta_id,estado='CONFIRMADA').exists():
            raise AgendaError('ATTENTION_NOT_COMPLETED','Completar requiere visita finalizada y venta confirmada de la misma clienta.')
        set_state(obj,'COMPLETADA',actor,'Atencion y venta confirmadas; cobro es independiente.')
    elif action=='confirmar':
        if obj.estado!='PROGRAMADA' or deposited(pk)<obj.anticipo_requerido or obj.fin_en<=timezone.now():
            raise AgendaError('APPOINTMENT_NOT_CONFIRMABLE','Se requiere cita programada vigente y anticipo suficiente.')
        set_state(obj,'CONFIRMADA',actor,'Confirmacion administrativa; no equivale a un pago.')
    else:
        obj=editable(pk)
        if action=='no-asistio':
            if timezone.now()<obj.fin_en:raise AgendaError('NO_SHOW_TOO_EARLY','No asistencia solo despues del final programado.')
            set_state(obj,'NO_ASISTIO',actor,data['motivo'])
        else:
            cfg=repo.config()
            if timezone.now()>obj.inicio_en-timedelta(hours=cfg.horas_limite_cancelacion) and not (data.get('fuera_plazo_autorizado') and actor.has_perm('agenda.override_policy')):
                raise AgendaError('CANCELLATION_DEADLINE','Cancelacion fuera de plazo requiere autorizacion excepcional.','forbidden')
            obj.cancelada_en,obj.cancelada_por,obj.motivo_cancelacion=timezone.now(),'NEGOCIO',data['motivo']
            obj.save(update_fields=['cancelada_en','cancelada_por','motivo_cancelacion'])
            set_state(obj,'CANCELADA',actor,data['motivo'])
            record(actor,obj,'CANCELAR_CITA',{'motivo':data['motivo'],'anticipo_confirmado':str(deposited(pk)),'reembolso_automatico':False})
    return result(obj)


def link_arrival(pk,arrival_id,actor):
    obj=get_object_or_404(m.Citas.objects.select_for_update(),pk=pk)
    # Existing Phase4 service validates client identity, confirmed arrival, window and uniqueness.
    visit=checkin.create_visit(arrival_id,actor)
    checkin.link_appointment(arrival_id,obj.pk,actor)
    return {'cita_id':obj.pk,'visita_id':visit.pk,'llegada_id':arrival_id}
