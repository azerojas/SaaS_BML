from contextlib import contextmanager
from django.db import connection, transaction, OperationalError
from django.db.migrations.recorder import MigrationRecorder
from apps.reporting.domain.errors import ReportError


def ensure_ready():
    if not MigrationRecorder(connection).migration_qs.filter(app='reporting',name='0001_report_permissions').exists():
        raise ReportError('fase6_permisos_pendientes','Falta activar los permisos de reportes mediante la migracion revisada.','unavailable')


@contextmanager
def read_snapshot():
    # No ATOMIC_REQUESTS: the report must start its own repeatable read-only snapshot.
    if connection.in_atomic_block:
        raise ReportError('transaccion_incompatible','El reporte requiere una transaccion de lectura independiente.','unavailable')
    try:
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
                cursor.execute("SET LOCAL statement_timeout = '5000ms'")
            yield
    except OperationalError as exc:
        if getattr(exc.__cause__,'sqlstate','') in ('57014','55P03'):
            raise ReportError('reporte_tiempo_excedido','Reduce el rango del reporte y reintenta.','limit') from None
        raise
