# Seguridad de agenda

Todos los endpoints privados exigen sesión activa, staff y permisos por acción; CSRF en todas las mutaciones, incluidas PUT/DELETE, y clave UUID persistente. Asignar usuario o usar excepción requiere permiso adicional. No confundir usuario ligado a profesional con permiso automático para administrar todas las citas. Roles de fases anteriores mantienen su política previa; no se afirma aislamiento global de caja en todo el monolito.

Público no recibe clientas, citas ocupadas, teléfono, usuario_id, comisión, notas, código o token_gestion. Solo profesionales cuya visibilidad autorizó personal, catálogo reservable y propuestas de slots. No consulta por teléfono. No hay rutas públicas de reserva/consulta personal/cancelación; tokens inválidos tampoco habilitan ninguna. Requiere flujo de identidad aprobado antes de añadirlas.

HMAC de IP y throttle PostgreSQL compartido; no registrar IP/PII en texto en contadores o logs nuevos. Límite público60/minuto configurable, listas100 y una fecha por consulta; estado privado no se filtra por razones públicas. No confiar en forwarding headers arbitrarios. CORS/cookies/CSRF siguen configuración existente; proxy/TLS productivos en Fase8.

Auditoría de negocios guarda IDs, campos, intervalos, motivos y snapshots necesarios para trazabilidad, no copia notas o teléfonos de fichas. Respuestas idempotentes no almacenan PII/códigos/tokens. Motivos son privados: no introducir datos innecesarios. No se imprime secreto de gestión en consola/URL ni se envían mensajes.

Ninguna prueba usa base real. Runner genera PostgreSQL aislado y verificaciones guardan backups privados. No ejecutar expirar_citas sobre Lasheo como smoke test, no modificar restricciones ni correr migraciones sin revisión/autorización. Nuevas pruebas cubren EXCLUDE real, múltiples conexiones, abortos, CSRF, permisos y anti-enumeración.
