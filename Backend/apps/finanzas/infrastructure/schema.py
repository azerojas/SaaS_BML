from django.db import connection
from django.db.migrations.recorder import MigrationRecorder
from apps.finanzas.domain.errors import FinanceError


def ensure_ready():
    if not MigrationRecorder(connection).migration_qs.filter(app='finanzas', name='0001_finance_support').exists():
        raise FinanceError('fase5_migracion_pendiente',
            'La fase 5 requiere aprobar y aplicar la migracion aditiva de soporte financiero.', 'unavailable')
    if not MigrationRecorder(connection).migration_qs.filter(app='finanzas',name='0002_cash_ledger').exists():
        raise FinanceError('ledger_migracion_pendiente','Activar ledger revisado antes de registrar cobros, ajustes o reembolsos.','unavailable')

