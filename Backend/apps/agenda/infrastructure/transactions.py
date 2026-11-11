from contextlib import contextmanager
from django.db import connection,transaction,IntegrityError,OperationalError
from django.db.migrations.recorder import MigrationRecorder
from apps.finanzas.infrastructure.idempotency import execute as financial_execute
from apps.agenda.domain.errors import AgendaError


def ensure_ready():
    if not MigrationRecorder(connection).migration_qs.filter(app='agenda',name='0001_agenda_permissions').exists():
        raise AgendaError('AGENDA_NOT_ACTIVATED','Falta activar los permisos revisados de agenda.','unavailable')


@contextmanager
def agenda_transaction():
    try:
        with transaction.atomic():
            with connection.cursor() as cursor:
                # Same financial/client ordering as Phases4/5, then a shared calendar lock.
                for key in (718302453,718302451,718302455):cursor.execute('SELECT pg_advisory_xact_lock(%s)',[key])
            yield
    except IntegrityError as exc:
        code=getattr(exc.__cause__,'sqlstate','')
        if code=='23P01':raise AgendaError('SLOT_NOT_AVAILABLE','El intervalo ya no esta disponible.') from None
        if code in ('23505','23503','23514'):raise AgendaError('AGENDA_INTEGRITY_CONFLICT','La operacion incumple una referencia, unicidad o politica de agenda.') from None
        raise
    except OperationalError as exc:
        if getattr(exc.__cause__,'sqlstate','') in ('40P01','40001','55P03'):
            raise AgendaError('RETRY_TRANSACTION','Reintenta la misma solicitud con su clave; no hubo cambios parciales.') from None
        raise


def execute(operation,key,payload,actor,callback,status=200):
    ensure_ready()
    def run(parsed):
        with agenda_transaction():return callback(parsed),status
    return financial_execute('agenda.'+operation,key,payload,actor,run)
