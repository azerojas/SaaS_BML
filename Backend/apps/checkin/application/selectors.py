from datetime import timedelta
from django.conf import settings
from django.db.models import Exists, OuterRef
from django.db.models.functions import Cast
from django.db.models import CharField
from django.shortcuts import get_object_or_404
from django.utils import timezone
from apps.catalogo.selectors import integer_param, search
from apps.inventario.selectors import date_range
from apps.clientas.serializers import normalize_phone
from rest_framework.exceptions import ValidationError
from negocio import models as m
from apps.checkin.domain.rules import cutoff


def provisional(client):
    audit = m.Auditoria.objects.filter(entidad='clientas', entidad_id=str(client.pk))
    return audit.filter(accion='ALTA_QR_PROVISIONAL').exists() and not audit.filter(accion='VALIDAR_ALTA_QR').exists()


def matching_clients(phone):
    ids = []
    for pk, stored in m.Clientas.objects.values_list('id', 'telefono').iterator():
        try:
            equivalent = normalize_phone(stored) == phone
        except ValidationError:
            equivalent = stored == phone
        if equivalent:
            ids.append(pk)
    return ids


def arrivals(params):
    source = m.Auditoria.objects.filter(entidad='clientas', entidad_id=Cast(OuterRef('clienta_id'), CharField()), accion='ALTA_QR_PROVISIONAL')
    verified = m.Auditoria.objects.filter(entidad='clientas', entidad_id=Cast(OuterRef('clienta_id'), CharField()), accion='VALIDAR_ALTA_QR')
    qs = m.Llegadas.objects.select_related('clienta', 'punto_qr').annotate(
        alta_provisional=Exists(source) & ~Exists(verified))
    qs = search(qs, params, ['clienta__nombres', 'clienta__apellidos', 'clienta__telefono'])
    state = params.get('estado')
    if state is not None:
        if state not in ('PENDIENTE', 'CONFIRMADA', 'RECHAZADA', 'CANCELADA'):
            raise ValidationError({'estado': 'Estado de llegada no valido.'})
        qs = qs.filter(estado=state)
    point = integer_param(params, 'punto')
    if point is not None:
        qs = qs.filter(punto_qr_id=point)
    current = params.get('vigentes', 'true')
    if current == 'true':
        qs = qs.exclude(estado='PENDIENTE', solicitada_en__lt=cutoff())
    elif current == 'false':
        qs = qs.filter(estado='PENDIENTE', solicitada_en__lt=cutoff())
    elif current != 'all':
        raise ValidationError({'vigentes': 'Usa true, false o all.'})
    return date_range(qs, params, 'solicitada_en').order_by('-solicitada_en', '-id')


def appointment_candidates(client_id):
    now = timezone.now()
    delta = timedelta(minutes=settings.CHECKIN_APPOINTMENT_WINDOW_MINUTES)
    return m.Citas.objects.filter(clienta_id=client_id, estado__in=['PROGRAMADA', 'CONFIRMADA'],
        visita__isnull=True, inicio_en__lte=now + delta, fin_en__gte=now - delta).order_by('inicio_en', 'id')


def arrival_detail(pk):
    from apps.checkin.presentation.serializers import ArrivalListOutput, VisitOutput
    obj = get_object_or_404(arrivals({'vigentes': 'all'}), pk=pk)
    data = ArrivalListOutput(obj).data
    visit = m.Visitas.objects.filter(llegada_id=pk).first()
    data['visita'] = VisitOutput(visit).data if visit else None
    data['citas_sugeridas'] = list(appointment_candidates(obj.clienta_id).values('id', 'inicio_en', 'fin_en', 'estado'))
    data['ultima_resolucion'] = m.Auditoria.objects.filter(entidad='llegadas', entidad_id=str(pk),
        accion__in=['CONFIRMAR', 'RECHAZAR', 'CANCELAR', 'EXPIRAR']).order_by('-id').values('accion', 'creada_en', 'datos').first()
    return data

