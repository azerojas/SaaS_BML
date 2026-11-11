from django.utils import timezone
from negocio.models import Auditoria


def record(actor, obj, action, data):
    Auditoria.objects.create(usuario_id=actor.pk, entidad=obj._meta.db_table, entidad_id=str(obj.pk),
                             accion=action, datos=data, creada_en=timezone.now())

