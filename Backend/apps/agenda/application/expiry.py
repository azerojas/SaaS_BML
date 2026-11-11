from django.utils import timezone
from negocio import models as m
from apps.agenda.infrastructure.transactions import agenda_transaction,ensure_ready
from .common import deposited,set_state,system_audit


def expire_locked(actor=None,limit=500,now=None):
    now=now or timezone.now()
    rows=list(m.Citas.objects.select_for_update().filter(estado='PENDIENTE_PAGO',expira_en__lte=now).order_by('id')[:limit])
    expired=promoted=0
    for row in rows:
        received=deposited(row.pk)
        if row.anticipo_requerido>0 and received>=row.anticipo_requerido:
            set_state(row,'PROGRAMADA',actor,'Anticipo confirmado suficiente al revisar vencimiento.')
            promoted+=1
        else:
            set_state(row,'EXPIRADA',actor,'Plazo de anticipo vencido; no se infiere reembolso.')
            expired+=1
            if received:system_audit(row,'INCIDENCIA_ANTICIPO',{'monto_confirmado':str(received),'motivo':'ANTICIPO_PARCIAL_RESERVA_EXPIRADA'})
    return {'expiradas':expired,'regularizadas':promoted,'revisadas':len(rows)}


def expire_pending(actor=None,limit=500):
    ensure_ready()
    with agenda_transaction():return expire_locked(actor,limit)
