from datetime import timedelta
from decimal import Decimal
from django.conf import settings
from negocio import models as m
from apps.finanzas.domain.errors import FinanceError


def candidates(visit):
    linked = m.Citas.objects.filter(visita_id=visit.pk, clienta_id=visit.clienta_id)
    if linked.exists():
        return linked.filter(estado__in=['PROGRAMADA', 'CONFIRMADA'])
    window = timedelta(minutes=settings.CHECKIN_APPOINTMENT_WINDOW_MINUTES)
    return m.Citas.objects.filter(
        clienta_id=visit.clienta_id, visita__isnull=True,
        estado__in=['PROGRAMADA', 'CONFIRMADA'],
        inicio_en__lte=visit.inicio_en + window,
        fin_en__gte=visit.inicio_en - window,
    )


def proposal(visit):
    rows = list(candidates(visit).select_related('profesional').order_by('id')[:2])
    if len(rows) != 1:
        return None
    appointment = rows[0]
    services = list(m.CitaServicios.objects.filter(cita_id=appointment.pk).select_related('servicio').order_by('orden', 'id'))
    if not services:
        return None
    return {
        'id': appointment.pk, 'profesional_id': appointment.profesional_id,
        'profesional_nombre': f'{appointment.profesional.nombres} {appointment.profesional.apellidos}',
        'inicio_en': appointment.inicio_en, 'fin_en': appointment.fin_en,
        'total': sum((row.precio_snapshot for row in services), Decimal('0.00')),
        'servicios': [{'servicio_id': row.servicio_id, 'nombre': row.servicio.nombre,
                       'precio': row.precio_snapshot, 'duracion_minutos': row.duracion_minutos} for row in services],
    }


def lock_for_sale(visit, appointment_id):
    appointment = candidates(visit).select_for_update().filter(pk=appointment_id).first()
    if appointment is None:
        raise FinanceError('cita_incompatible', 'La cita ya no esta disponible para esta visita. Vuelve a consultar.')
    return appointment


def lines(appointment):
    return [{'tipo': 'SERVICIO', 'servicio_id': row.servicio_id,
             'profesional_id': appointment.profesional_id,
             'cantidad': Decimal('1.000'), 'descuento_linea': Decimal('0.00')}
            for row in m.CitaServicios.objects.filter(cita_id=appointment.pk).order_by('orden', 'id')]
