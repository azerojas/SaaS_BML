"""Permission anchor only. Proxy: no new or modified PostgreSQL business table."""
from apps.finanzas.models import IdempotencyRecord


class ReportAccess(IdempotencyRecord):
    class Meta:
        proxy = True
        default_permissions = ()
        permissions = [
            ('view_summary', 'Consultar resumen y reportes financieros'),
            ('view_clients', 'Consultar rankings e indicadores privados de clientas'),
            ('view_inventory', 'Consultar reportes de inventario'),
            ('export', 'Exportar reportes autorizados a Excel'),
        ]
