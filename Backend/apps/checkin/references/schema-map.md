# Mapa inspeccionado de PostgreSQL — fase 4

No se ejecutó DDL. Las 34 tablas de negocio y las 7 vistas permanecen originales, con 11 tablas internas de Django/control de intentos adicionales.

| Tabla | Modelo canónico | Invariantes |
|---|---|---|
| puntos_qr | negocio.models.PuntosQr | Identity BIGINT, UUID UNIQUE generado mediante gen_random_uuid(), activo true, creado_en now() |
| clientas | negocio.models.Clientas | Teléfono UNIQUE exacto; CHECK de fecha de consentimiento; trigger actualizado_en |
| llegadas | negocio.models.Llegadas | FK clienta obligatoria; punto nullable; QR/MANUAL; PENDIENTE/CONFIRMADA/RECHAZADA/CANCELADA |
| visitas | negocio.models.Visitas | FK clienta; llegada nullable UNIQUE; ABIERTA/FINALIZADA/CANCELADA; fin>=inicio |
| citas | negocio.models.Citas | visita nullable UNIQUE; no hay llegada_id; exclusiones por profesional/clienta y rango |
| auditoria | negocio.models.Auditoria | Actor nullable, entidad/id/acción y JSONB; evidencia y resoluciones, sin copiar teléfonos/notas |
| autenticacion_loginattempt | apps.autenticacion.models.LoginAttempt | Contadores ya existentes, reutilizados con claves HMAC de namespace checkin |

Todos los modelos heredados mantienen managed=False. Se corrigió Llegadas.clienta de OneToOneField a ForeignKey: inspectdb había confundido uq_llegada_pendiente_clienta, índice UNIQUE parcial por estado, con unicidad global. Ahora permite varias llegadas históricas y una sola PENDIENTE global por clienta, incluso entre puntos distintos.

PuntosQr, Llegadas y Visitas reflejan sus defaults reales mediante db_default, incluidos UUID y fechas generadas en PostgreSQL. No se creó ni cambió ninguna columna. Las 13 FK a auth_user inspeccionadas siguen activas.

No hay estado EXPIRADA ni campo vencimiento/resolución/motivo en llegadas. La expiración usa CANCELADA; sello temporal, motivo y actor se registran en auditoria. La propuesta de alta y su validación también se distinguen mediante eventos de auditoría, sin inventar columnas.

La igualdad entre clienta de llegada y visita se impone en los comandos; no existe CHECK SQL cruzado. El UNIQUE de visitas.llegada_id es la defensa física para una sola visita por llegada.

Los archivos references de la skill no estaban en Downloads/references. Este mapa y los contratos/checklists asociados se elaboraron con la skill principal y las consultas reales a information_schema, pg_constraint, pg_indexes y pg_trigger.

