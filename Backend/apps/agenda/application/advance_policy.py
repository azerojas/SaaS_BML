"""Public hook used by the existing financial confirmation service, inside its transaction."""
from django.utils import timezone
from apps.finanzas.domain.errors import FinanceError
from .common import set_state


def before_confirmation(appointment):
    if appointment.estado=='PENDIENTE_PAGO' and appointment.expira_en<=timezone.now():
        raise FinanceError('cita_vencida','La reserva ya vencio; no se confirma dinero ni se reabre el hueco.')


def after_confirmation(appointment,total_confirmed,actor):
    if appointment.estado=='PENDIENTE_PAGO' and total_confirmed>=appointment.anticipo_requerido:
        set_state(appointment,'PROGRAMADA',actor,'Anticipo requerido confirmado manualmente.')
