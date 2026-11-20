"""Explicit operational cleanup; financial history remains available by appointment ID."""
from django.utils import timezone
from apps.agenda.models import CalendarArchive, DailySchedule, PublicBookingRequest
from apps.agenda.domain.rules import ACTIVE
from apps.agenda.infrastructure.transactions import agenda_transaction
from apps.finanzas.application.audit import record
from negocio import models as m
from .common import set_state


def clear_calendar(actor):
    if not actor.has_perm('agenda.manage_appointments') or not actor.has_perm('agenda.manage_schedules'):
        raise PermissionError('Calendar management permissions required.')
    with agenda_transaction():
        appointments=list(m.Citas.objects.select_for_update().exclude(pk__in=CalendarArchive.objects.values('appointment_id')).order_by('pk'))
        summary={'archived_appointments':len(appointments),'cancelled_active':0,
                 'daily_schedules':DailySchedule.objects.count(),
                 'weekly_schedules':m.HorariosProfesional.objects.count(),
                 'blocks':m.BloqueosAgenda.objects.count(),
                 'pending_requests':PublicBookingRequest.objects.filter(estado='PENDIENTE').count()}
        reason='Limpieza completa del calendario solicitada por el propietario.'
        for appointment in appointments:
            if appointment.estado in ACTIVE:
                appointment.cancelada_en=timezone.now()
                appointment.cancelada_por='NEGOCIO'
                appointment.motivo_cancelacion=reason
                set_state(appointment,'CANCELADA',actor,reason)
                summary['cancelled_active']+=1
        CalendarArchive.objects.bulk_create([CalendarArchive(appointment_id=row.pk,actor_id=actor.pk) for row in appointments])
        PublicBookingRequest.objects.filter(estado='PENDIENTE').update(estado='RECHAZADA',motivo_publico=reason)
        DailySchedule.objects.all().delete()
        m.HorariosProfesional.objects.all().delete()
        m.BloqueosAgenda.objects.all().delete()
        record(actor,actor,'LIMPIAR_CALENDARIO',summary)
        return summary
