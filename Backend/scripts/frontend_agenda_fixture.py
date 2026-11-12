"""Synthetic fixtures for real browser tests; refuses non-temporary databases."""
from datetime import datetime, time, timedelta
from decimal import Decimal
from django.db import connection, transaction
from django.utils import timezone
from apps.agenda.domain.rules import ZONE
from apps.agenda.domain.commands import BookingCommand
from apps.agenda.application import bookings
from negocio import models as m


def seed(actor):
    assert connection.settings_dict['NAME'].startswith('frontend_e2e_')
    now = timezone.now()
    day = now.astimezone(ZONE).date() + timedelta(days=3)
    m.ConfiguracionReservas.objects.create(id=1, reservas_online_activas=False,
        intervalo_slots_minutos=15, anticipacion_minima_minutos=0, anticipacion_maxima_dias=60,
        horas_limite_cancelacion=24, anticipo_porcentaje=Decimal('20.00'),
        minutos_expiracion_pago=30, max_citas_activas_por_clienta=10, actualizado_en=now)
    professional = m.Profesionales.objects.create(nombres='Agenda F6', apellidos='E2E', activa=True)
    service = m.Servicios.objects.create(nombre='Servicio agenda F6 E2E',slug='servicio-agenda-f6-e2e',
        activo=True, duracion_minutos=30, precio_base=Decimal('100.00'),requiere_anticipo=True)
    m.ProfesionalServicios.objects.create(profesional=professional, servicio=service)
    for weekday in range(1,8):
        m.HorariosProfesional.objects.create(profesional=professional,dia_semana=weekday,hora_inicio=time(9),hora_fin=time(17))
    clients = [m.Clientas.objects.create(nombres='Agenda F6 '+str(index),apellidos='E2E',
        telefono='+5194412300'+str(index),activa=True,canal_preferido='EMAIL',acepta_recordatorios=False) for index in range(5)]
    with transaction.atomic():
        result=bookings.create(BookingCommand(clients[0].pk,professional.pk,(service.pk,),datetime.combine(day,time(10),ZONE)),actor)
    m.BloqueosAgenda.objects.create(profesional=professional,inicio_en=datetime.combine(day,time(12),ZONE),
        fin_en=datetime.combine(day,time(13),ZONE),motivo='Pausa sintética F6',creado_por_id=actor.pk)
    expired=m.Citas.objects.create(clienta=clients[4],profesional=professional,estado='EXPIRADA',
        inicio_en=datetime.combine(day,time(16),ZONE),fin_en=datetime.combine(day,time(16,30),ZONE),
        duracion_total_minutos=30,precio_total=Decimal('100'),anticipo_requerido=Decimal('20'),expira_en=now-timedelta(minutes=1))
    qr=m.Citas.objects.create(clienta=clients[3],profesional=professional,estado='CONFIRMADA',
        inicio_en=now-timedelta(minutes=5),fin_en=now+timedelta(minutes=25),
        duracion_total_minutos=30,precio_total=Decimal('100'),anticipo_requerido=Decimal('0'))
    return {'date':day.isoformat(),'professional':professional.pk,'service':service.pk,
        'clients':[row.pk for row in clients],'appointment':result['cita_id'],'expired':expired.pk,'qr':qr.pk,'synthetic_only':True}
