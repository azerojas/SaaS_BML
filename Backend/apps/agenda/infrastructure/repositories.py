from django.db.models import Prefetch,Q
from django.shortcuts import get_object_or_404
from negocio import models as m
from apps.agenda.domain.rules import ACTIVE,hourly_windows
from apps.agenda.domain.errors import AgendaError


def config(lock=False):
    qs=m.ConfiguracionReservas.objects.select_for_update() if lock else m.ConfiguracionReservas.objects
    obj=qs.filter(pk=1).first()
    if not obj:raise AgendaError('BOOKING_CONFIGURATION_MISSING','Debe existir configuracion de reservas id1.','unavailable')
    return obj


def eligible(professional_id,service_ids,public=False):
    professional=get_object_or_404(m.Profesionales,pk=professional_id,activa=True)
    if public and not professional.visible_reservas:raise AgendaError('BOOKING_NOT_AVAILABLE','Consulta no disponible.','not_found')
    if len(service_ids)!=len(set(service_ids)) or not 1<=len(service_ids)<=10:
        raise AgendaError('INVALID_SERVICES','Indica de1 a10 servicios distintos.','invalid')
    found={row.pk:row for row in m.Servicios.objects.filter(pk__in=service_ids,activo=True)}
    allowed=set(m.ProfesionalServicios.objects.filter(profesional_id=professional_id,servicio_id__in=service_ids).values_list('servicio_id',flat=True))
    if len(found)!=len(service_ids) or allowed!=set(service_ids) or public and any(not found[pk].reservable_online or not found[pk].visible_catalogo for pk in service_ids):
        raise AgendaError('SERVICES_NOT_AVAILABLE','Servicios no habilitados para este profesional/canal.','invalid' if not public else 'not_found')
    return professional,[found[pk] for pk in service_ids]


def hours(professional_id,day=None):
    if day is not None:
        from apps.agenda.application.daily_schedule import dated_hours
        override=dated_hours(professional_id,day)
        if override is not None:return override
    return list(m.HorariosProfesional.objects.filter(profesional_id=professional_id).order_by('dia_semana','hora_inicio','id').values_list('dia_semana','hora_inicio','hora_fin'))


def booking_windows(professional_id,day):
    from apps.agenda.application.daily_schedule import dated_hours
    personal=requires_personal_slots(professional_id)
    override=dated_hours(professional_id,day,include_slot_mode=True,personal_only=personal)
    if override is not None:
        if personal:
            return hourly_windows([(weekday,begin,finish,True) for weekday,begin,finish,_ in override])
        return hourly_windows(override)
    if personal:
        return []
    return hourly_windows([(weekday,begin,finish,False) for weekday,begin,finish in hours(professional_id)])


def requires_personal_slots(professional_id):
    return personal_slot_professionals().filter(pk=professional_id).exists()


def personal_slot_professionals():
    return m.Profesionales.objects.filter(
        Q(usuario__is_superuser=True) |
        Q(usuario__user_permissions__codename__in=['manage_own_schedule','manage_schedules'],usuario__user_permissions__content_type__app_label='agenda') |
        Q(usuario__groups__permissions__codename__in=['manage_own_schedule','manage_schedules'],usuario__groups__permissions__content_type__app_label='agenda')
    )


def collision(professional_id,start,end,client_id=None,exclude=None,client_interval=None):
    qs=m.Citas.objects.filter(estado__in=ACTIVE,inicio_en__lt=end,fin_en__gt=start)
    if exclude:qs=qs.exclude(pk=exclude)
    match=Q(profesional_id=professional_id)
    if client_id:
        client_start,client_end=client_interval or (start,end)
        match|=Q(clienta_id=client_id,inicio_en__lt=client_end,fin_en__gt=client_start)
    collision_found=qs.filter(match).exists() or m.BloqueosAgenda.objects.filter(Q(profesional_id=professional_id)|Q(profesional_id=None),inicio_en__lt=end,fin_en__gt=start).exists()
    if collision_found:return True
    from apps.agenda.application.public_booking import installed,holds
    return installed() and holds().filter(profesional_id=professional_id,inicio_en__lt=end,fin_en__gt=start).exists()


def appointments():
    return m.Citas.objects.select_related('clienta','profesional').prefetch_related(
        Prefetch('citaservicios_set',queryset=m.CitaServicios.objects.select_related('servicio').order_by('orden','id')))
