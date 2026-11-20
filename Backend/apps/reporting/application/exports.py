from datetime import timedelta
from django.db import transaction, connection
from django.utils import timezone
from negocio import models as m
from apps.reporting.domain.errors import ReportError
from apps.reporting.infrastructure.excel_export import build_workbook
from .services import export_data


def export_report(report, filters, actor, ordering='importe', limit=100):
    summary,details=export_data(report,filters,ordering,include_clients=actor.has_perm('reporting.view_clients'))
    content,rows=build_workbook(report,filters,summary,details,limit)
    # Audit is the sole write: after the read-only report transaction and file generation.
    # Per-user advisory lock makes the 5 successful exports/minute limit concurrency safe.
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute('SELECT pg_advisory_xact_lock(718302460,%s)',[actor.pk])
        recent=m.Auditoria.objects.filter(usuario_id=actor.pk,entidad='reporting',accion='EXPORTAR_XLSX',creada_en__gte=timezone.now()-timedelta(minutes=1)).count()
        if recent>=5: raise ReportError('exportacion_limitada','Maximo 5 exportaciones exitosas por minuto y cuenta.','rate')
        m.Auditoria.objects.create(usuario_id=actor.pk,entidad='reporting',accion='EXPORTAR_XLSX',
            datos={'report':report,'desde':filters.desde.isoformat(),'hasta':filters.hasta.isoformat(),
                   'filtros':filters.metadata()['filtros'],'orden':ordering,'limit':limit,'filas':rows},creada_en=timezone.now())
    return content
