from django.db.models import Sum
from django.utils import timezone
from negocio import models as m
from apps.finanzas.application.audit import record
from apps.agenda.domain.rules import transition
from decimal import Decimal


def deposited(appointment_id):
    return m.AnticiposCita.objects.filter(cita_id=appointment_id,estado='CONFIRMADO').aggregate(total=Sum('monto'))['total'] or Decimal('0.00')


def annotate_history(appointment,actor=None,detail=''):
    latest=m.CitaEstadosHistorial.objects.filter(cita_id=appointment.pk).order_by('-id').first()
    if latest:
        latest.cambiado_por_id=actor.pk if actor else None
        latest.origen='STAFF' if actor else 'SISTEMA'
        latest.detalle=detail[:250]
        latest.save(update_fields=['cambiado_por','origen','detalle'])


def set_state(appointment,target,actor=None,detail=''):
    transition(appointment.estado,target)
    appointment.estado=target
    if target=='CONFIRMADA':appointment.confirmada_en=timezone.now()
    appointment.save()
    annotate_history(appointment,actor,detail)
    record(actor,appointment,'ESTADO_CITA',{'estado':target}) if actor else system_audit(appointment,'ESTADO_CITA',{'estado':target})


def system_audit(obj,action,data):
    m.Auditoria.objects.create(entidad=obj._meta.db_table,entidad_id=str(obj.pk),accion=action,datos=data,creada_en=timezone.now())
