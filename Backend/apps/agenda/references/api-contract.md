# Contrato REST Fase7

Fuente completa: [agenda-api.md](../../../docs/agenda-api.md), [OpenAPI1.6.0](../../../docs/openapi.json), [payloads validados](../examples/api-examples.json). 27 rutas nuevas:24 privadas y3 públicas de consulta. Prefijo privado `/api/v1/agenda/`.

En Angular conservar Idempotency-Key por intención/reintento, enviar dinero como cadena y timestamps con offset, mostrar disponibilidad como propuesta, reconsultar GET tras replay si se necesita estado actual. `hasta` es exclusiva. No crear pagos al recibir confirmación de cita, vincular llegada, aplicar anticipo o convertir espera.
