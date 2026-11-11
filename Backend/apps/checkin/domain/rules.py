from datetime import timedelta
from django.conf import settings
from django.utils import timezone
from apps.catalogo.services import CatalogConflict

PUBLIC_MESSAGE = 'Si los datos son válidos, tu solicitud de llegada se ha recibido. Acércate a recepción para confirmarla.'


def pending_is_current(state, requested_at, expires_before):
    return state == 'PENDIENTE' and requested_at >= expires_before


def cutoff():
    return timezone.now() - timedelta(minutes=settings.CHECKIN_PENDING_TTL_MINUTES)


def require_pending(arrival, allow_expired=False):
    if arrival.estado != 'PENDIENTE':
        raise CatalogConflict('La llegada ya fue resuelta.', 'transicion_llegada')
    if not allow_expired and not pending_is_current(arrival.estado, arrival.solicitada_en, cutoff()):
        raise CatalogConflict('La solicitud ha vencido; debe cancelarse antes de solicitar otra.', 'llegada_vencida')

