from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.utils import timezone
from datetime import timedelta
from django.db.models import Q
from negocio import models as m
from apps.finanzas.application.audit import record
from apps.agenda.domain.errors import AgendaError
from apps.agenda.domain.rules import ACTIVE,fits,ZONE
from apps.agenda.infrastructure import repositories as repo


def future_appointments(professional_id=None):
    qs=m.Citas.objects.filter(estado__in=ACTIVE,fin_en__gt=timezone.now())
    return qs.filter(profesional_id=professional_id) if professional_id else qs


def professional(data,actor,pk=None):
    obj=get_object_or_404(m.Profesionales.objects.select_for_update(),pk=pk) if pk else m.Profesionales(visible_reservas=False)
    if 'usuario_id' in data:
        if not actor.has_perm('agenda.assign_users'):raise AgendaError('USER_ASSIGNMENT_FORBIDDEN','Falta permiso para vincular usuario.','forbidden')
        if data['usuario_id'] is not None:get_object_or_404(get_user_model(),pk=data['usuario_id'],is_active=True,is_staff=True)
    if pk and data.get('activa') is False and future_appointments(pk).exists():
        raise AgendaError('PROFESSIONAL_HAS_BOOKINGS','Resuelve las citas activas futuras antes de desactivar.')
    for key,value in data.items():setattr(obj,key,value)
    obj.save()
    record(actor,obj,'EDITAR_PROFESIONAL' if pk else 'CREAR_PROFESIONAL',{'campos':sorted(data)})
    return {'profesional_id':obj.pk,'activa':obj.activa}


def specialties(pk,ids,actor):
    get_object_or_404(m.Profesionales.objects.select_for_update(),pk=pk,activa=True)
    if len(ids)!=len(set(ids)) or m.Servicios.objects.filter(pk__in=ids,activo=True).count()!=len(ids):
        raise AgendaError('INVALID_SERVICES','Servicios activos distintos requeridos.','invalid')
    removed=set(m.ProfesionalServicios.objects.filter(profesional_id=pk).values_list('servicio_id',flat=True))-set(ids)
    if m.CitaServicios.objects.filter(cita__in=future_appointments(pk),servicio_id__in=removed).exists():
        raise AgendaError('SPECIALTY_HAS_BOOKINGS','No se retira una especialidad con citas activas futuras.')
    m.ProfesionalServicios.objects.filter(profesional_id=pk).exclude(servicio_id__in=ids).delete()
    m.ProfesionalServicios.objects.bulk_create([m.ProfesionalServicios(profesional_id=pk,servicio_id=value) for value in ids],ignore_conflicts=True)
    record(actor,m.Profesionales.objects.get(pk=pk),'ESPECIALIDADES',{'servicios':ids})
    return {'profesional_id':pk,'servicios':ids}


def validate_schedule_coverage(professional_id,exclude=None,replacement=None):
    qs=m.HorariosProfesional.objects.filter(profesional_id=professional_id)
    if exclude:qs=qs.exclude(pk=exclude)
    hours=list(qs.values_list('dia_semana','hora_inicio','hora_fin'))
    if replacement:hours.append((replacement['dia_semana'],replacement['hora_inicio'],replacement['hora_fin']))
    rows=list(future_appointments(professional_id).values_list('inicio_en','fin_en')[:10001])
    if len(rows)>10000:raise AgendaError('CALENDAR_TOO_LARGE','Resuelve el cambio de horario con un rango acotado.','invalid')
    if any(not fits(start,end,hours,1,aligned=False) for start,end in rows):
        raise AgendaError('SCHEDULE_HAS_BOOKINGS','El cambio dejaria citas futuras fuera del horario; reprograma primero.')


def schedule(data,actor,pk=None,remove=False,reason=None):
    obj=get_object_or_404(m.HorariosProfesional.objects.select_for_update(),pk=pk) if pk else None
    professional_id=obj.profesional_id if obj else data['profesional_id']
    get_object_or_404(m.Profesionales.objects.select_for_update(),pk=professional_id,activa=True)
    fields={key:getattr(obj,key) for key in ('dia_semana','hora_inicio','hora_fin')} if obj else {}
    fields.update({key:value for key,value in data.items() if key!='profesional_id'})
    if not remove and fields['hora_inicio']>=fields['hora_fin']:raise AgendaError('INVALID_WORK_HOURS','hora_inicio debe preceder hora_fin; no cruza medianoche.','invalid')
    validate_schedule_coverage(professional_id,pk,None if remove else fields)
    if remove:
        record(actor,obj,'RETIRAR_HORARIO',{'dia_semana':obj.dia_semana,'hora_inicio':str(obj.hora_inicio),'hora_fin':str(obj.hora_fin),'motivo':reason})
        obj.delete()
        return {'horario_id':pk,'retirado':True}
    if obj:
        for key,value in fields.items():setattr(obj,key,value)
        obj.save()
    else:obj=m.HorariosProfesional.objects.create(profesional_id=professional_id,**fields)
    record(actor,obj,'GUARDAR_HORARIO',{'campos':sorted(fields)})
    return {'horario_id':obj.pk}


def block(data,actor,pk=None,remove=False,reason=None):
    obj=get_object_or_404(m.BloqueosAgenda.objects.select_for_update(),pk=pk) if pk else None
    if remove:
        record(actor,obj,'RETIRAR_BLOQUEO',{'inicio_en':obj.inicio_en.isoformat(),'fin_en':obj.fin_en.isoformat(),'profesional_id':obj.profesional_id,'motivo':reason})
        obj.delete()
        return {'bloqueo_id':pk,'retirado':True}
    fields={key:getattr(obj,key) for key in ('profesional_id','inicio_en','fin_en','motivo')} if obj else {}
    fields.update({key:value for key,value in data.items() if key!='excepcion_historica'})
    if fields.get('profesional_id'):get_object_or_404(m.Profesionales,pk=fields['profesional_id'],activa=True)
    if fields['inicio_en']>=fields['fin_en'] or fields['fin_en']-fields['inicio_en']>timedelta(days=366):
        raise AgendaError('INVALID_BLOCK','Intervalo de bloqueo invalido o superior a366 dias.','invalid')
    if fields['inicio_en']<timezone.now() and not (data.get('excepcion_historica') and actor.has_perm('agenda.override_policy')):
        raise AgendaError('HISTORICAL_BLOCK_FORBIDDEN','Intervalo historico requiere autorizacion excepcional.','forbidden')
    qs=m.Citas.objects.filter(estado__in=ACTIVE,inicio_en__lt=fields['fin_en'],fin_en__gt=fields['inicio_en'])
    if fields.get('profesional_id'):qs=qs.filter(profesional_id=fields['profesional_id'])
    if qs.exists():raise AgendaError('BLOCK_HAS_BOOKINGS','Reprograma o cancela las citas afectadas antes de crear el bloqueo.')
    if obj:
        for key,value in fields.items():setattr(obj,key,value)
        obj.save()
    else:obj=m.BloqueosAgenda.objects.create(**fields,creado_por_id=actor.pk)
    record(actor,obj,'GUARDAR_BLOQUEO',{'campos':sorted(fields)})
    return {'bloqueo_id':obj.pk}


def configure(data,actor):
    obj=repo.config(lock=True)
    for key,value in data.items():setattr(obj,key,value)
    obj.actualizado_en=timezone.now()
    obj.save()
    record(actor,obj,'CONFIGURAR_AGENDA',{'campos':sorted(data)})
    return {'configuracion_id':obj.pk}
