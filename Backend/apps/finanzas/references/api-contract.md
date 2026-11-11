# Contrato Fase 5

Fuente consolidada: [finanzas-api.md](../../../docs/finanzas-api.md) y [OpenAPI](../../../docs/openapi.json). Ejemplos de payload: [api-examples.json](../examples/api-examples.json). Todas las rutas son privadas por sesión, CSRF y permisos finanzas por acción. Todas las mutaciones son idempotentes; la previsualización es lectura.

No aceptar totales calculados por Angular, movimientos de stock directos desde caja o pagos que representen un anticipo previamente cobrado. Consultar saldo del servidor después de cambios y mantener la clave UUID durante cada reintento de la misma intención.
