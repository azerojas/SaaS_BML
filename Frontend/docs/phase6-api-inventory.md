# Fase 6: contrato de agenda comprobado

Auditoría: 12 de noviembre de 2026. Fuente: `Backend/apps/agenda/presentation/{urls,views,serializers,permissions}.py`, servicios de aplicación, `Backend/docs/agenda-api.md` y pruebas HTTP reales en PostgreSQL temporal. No se consultó ni modificó el esquema de producción.

La skill adjunta es `beauty-manager-frontend-fase-6`, leída de `C:/Users/Usuario/Downloads/SKILL (1).md`. Sus referencias `references/api-contract.md`, `references/test-checklist.md` y `templates/closure-report.md` no acompañan el archivo; se usaron el contrato y las convenciones reales del repositorio. No se inventaron endpoints para suplirlas.

## Autenticación y convenciones

- Prefijo privado: `/api/v1/agenda/`. Staff activo, sesión y MFA existentes; GET exige `agenda.view_agenda`.
- Mutaciones: CSRF existente mediante `ResourceApi` + `Idempotency-Key` UUID. Django conserva resultado y digest por actor/operación. Las escrituras de agenda y finanzas comparten bloqueo transaccional en PostgreSQL.
- Fechas `America/Lima`. Instantes con offset; `datetime-local` se convierte explícitamente a `-05:00`. Rangos `[desde,hasta)`, hasta exclusiva, máximo 93 días.
- Listas paginadas: `count,next,previous,results`, máximo 100 por página. Angular recorre hasta 20 páginas y falla explícitamente si quedan más, sin presentar un calendario parcial como disponibilidad.
- Importes decimales como cadenas, duración/precios/anticipo calculados por Django. No se envían totales de reserva desde Angular.
- No se usa la API pública opcional de agenda ni se crean cuentas para clientas.

## Endpoints utilizados

| Ruta relativa al prefijo                | Métodos                  | Uso / permiso adicional de escritura                                                                |
| --------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------- |
| `calendario/`                           | GET                      | Citas por rango, profesional y estado                                                               |
| `calendario/disponibilidad/`            | GET                      | `fecha`, `profesional_id`, `servicios=1,2`; propuestas de huecos reales                             |
| `calendario/configuracion/`             | GET, PATCH               | Políticas; `agenda.configure_agenda` para PATCH                                                     |
| `profesionales/`, `profesionales/{id}/` | GET, POST, PATCH         | Ficha, alta y edición; `agenda.manage_professionals`                                                |
| `profesionales/{id}/especialidades/`    | GET, PUT                 | IDs de servicios autorizados; `agenda.manage_professionals`                                         |
| `horarios/`, `horarios/{id}/`           | GET, POST, PATCH, DELETE | Horarios ISO lunes=1; `agenda.manage_schedules`                                                     |
| `bloqueos/`, `bloqueos/{id}/`           | GET, POST, PATCH, DELETE | Bloqueo profesional/global; `agenda.manage_blocks`                                                  |
| `citas/`, `citas/{id}/`                 | GET, POST                | Reserva y detalle con snapshots, historial y anticipos oficiales                                    |
| `citas/{id}/reprogramar/`               | POST                     | Inicio/profesional/motivo; conserva snapshots al omitir servicios                                   |
| `citas/{id}/confirmar/`                 | POST                     | Confirmación administrativa; no registra cobro                                                      |
| `citas/{id}/cancelar/`                  | POST                     | Motivo y autorización excepcional opcional; no devuelve dinero                                      |
| `citas/{id}/no-asistio/`                | POST                     | Motivo; Django exige haber pasado el final                                                          |
| `citas/{id}/completar/`                 | POST                     | Django exige visita finalizada y venta confirmada                                                   |
| `citas/expirar/`                        | POST                     | Procesamiento oficial de vencimientos en Django, hasta 500 por lote                                 |
| `citas/{id}/vincular-llegada/`          | POST                     | `llegada_id`; `agenda.link_arrivals`; reutiliza visita, exige identidad confirmada y compatibilidad |
| `lista-espera/`, `lista-espera/{id}/`   | GET, POST                | Solicitudes y detalle; creación exige `agenda.manage_waitlist`                                      |
| `lista-espera/{id}/oferta-manual/`      | POST                     | Registro de oferta realizada fuera del sistema; no envía mensajes                                   |
| `lista-espera/{id}/cancelar/`           | POST                     | Motivo, resolución real de solicitud                                                                |
| `lista-espera/{id}/convertir/`          | POST                     | Crea cita y resuelve espera atómicamente; exige también `agenda.manage_appointments`                |

Las acciones de cita, salvo vinculación, exigen `agenda.manage_appointments`. Retirar horario/bloqueo requiere cuerpo `confirmar_retiro:true,motivo`. Asociar o retirar usuario exige `agenda.assign_users`; excepciones históricas y cancelación tardía exigen `agenda.override_policy`.

| Endpoint externo al prefijo           | Uso                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `GET /api/auth/csrf/`                 | Preparación de escrituras autenticadas                                  |
| `GET /api/admin/catalogo/servicios/`  | Búsqueda paginada de servicios activos; `negocio.view_servicios`        |
| `GET /api/clientas/`                  | Selector de clientas existente; `negocio.view_clientas`                 |
| `GET /api/anticipos/?cita={id}`       | Anticipos de la reserva; **el filtro real es `cita`, no `cita_id`**     |
| `POST /api/anticipos/`                | Registro pendiente, método, monto y referencia                          |
| `POST /api/anticipos/{id}/confirmar/` | Verificación manual explícita; Django valida monto, plazo y referencias |
| `POST /api/anticipos/{id}/anular/`    | Solo pendientes, con motivo; no simula reembolso                        |

Leer anticipos exige `finanzas.view_finance`; mutarlos exige además `finanzas.manage_advances`. El panel rechaza toda respuesta que contenga un `cita_id` distinto al solicitado. La selección de llegada utiliza su ID confirmado y enlaza a la bandeja existente; no se enumeran teléfonos ni se valida identidad por coincidencia de nombre.

## Brechas y contratos necesarios

### Bloqueo de cierre: comisiones en el backend

`ProfessionalOutput` incluye `comision_porcentaje` para cualquier GET autorizado con `agenda.view_agenda`. Ese permiso no distingue administradoras de personal que solo consulta agenda. Ocultar un campo HTML no corrige su exposición HTTP.

Esta entrega restringe los GET de profesionales a `agenda.manage_professionals`, incluyendo calendario, selector de disponibilidad, bloqueos y ficha. Para otros roles se muestra una dependencia explícita y el calendario permite filtrar por ID sin solicitar el listado. La ruta de profesionales tiene guard administrativo. La selección de profesional/reserva para roles sin ese permiso queda bloqueada; no se recomienda conceder permisos de edición como solución al problema de lectura.

**Corrección propuesta, no aplicada:** proyectar campos públicos internos mínimos para `view_agenda` (`id,nombres,apellidos,activa`) y añadir campos de administración solo con `manage_professionals`, tanto en lista como detalle. Las especialidades pueden seguir devolviendo solo IDs. Alternativamente, añadir un lookup privado sin comisiones. Requiere pruebas HTTP negativas de privacidad y positivas de reserva con un rol gestor sin gestión de profesionales. No requiere migraciones ni SQL. Hasta corregir y comprobar esta autorización en Django, la fase no se considera cerrada.

La skill indica: «No generar migraciones ni cambiar SQL sin solicitud explícita; si el backend necesita una corrección, documentar la propuesta y bloquear la funcionalidad dependiente». Se respeta esa restricción; esta entrega no cambia reglas ni serializers del backend de negocio.

### Recuperación tras pérdida de respuesta y recarga

`/api/finanzas/intentos/{uuid}/` existe, pero no admite operaciones `agenda.*` ni `anticipo.crear/confirmar/anular`. No se lo presenta como una integración de agenda.

En memoria se conserva el cuerpo original y el reintento reutiliza exactamente cuerpo, URL, método y UUID. Solo se persisten UUID, ruta, método y SHA-256 del cuerpo en `sessionStorage` por actor; no nombres, teléfono, notas, importes ni tokens. Después de recargar se exige reconstruir exactamente el formulario original: el digest impide otra intención y mantiene la misma clave. Si no puede reconstruirse, se requiere revisión administrativa; no se habilita un botón para descartar la clave y repetir el cobro. Esto evita duplicación, pero limita la recuperación operativa.

**Contrato propuesto:** GET privado de estado de intención por UUID y operación, limitado al mismo actor y permiso de la acción, sincronizado con el bloqueo de idempotencia existente. Respuesta `{encontrado,operacion,resultado,estado_http}` sin cuerpo de solicitud ni datos de terceros. Debe permitir recuperar `agenda.*` y las tres acciones de anticipos. Es una dependencia documentada, no un endpoint implementado o simulado.

### Filtros y snapshots

El calendario y lista de citas no aceptan `servicio_id`. Se filtra por servicios leyendo snapshots de todos los detalles del rango ya autorizado, con concurrencia máxima de seis y límite total explícito. La espera tampoco admite filtro por servicio; se filtra la colección completa del rango recibida. Profesional/estado/fecha se filtran en Django. Recomendación: ampliar el contrato de lectura para evitar consultas por detalle a gran escala.

Disponibilidad no permite excluir una cita ni indicar una versión de snapshot. Reprogramar consulta disponibilidad del catálogo actual y omite servicios al escribir para conservar snapshots. Si cambió la duración del catálogo, la propuesta puede diferir de la reserva histórica y Django puede rechazarla. No se fuerza un hueco ni se recalcula una duración oficial en Angular. Un contrato futuro de disponibilidad para reprogramación debe aceptar la cita y usar sus snapshots.

No se verificó activación ni configuración de agenda en la base de producción. Los errores de módulo no activado o configuración ausente se muestran como dependencias del servidor.
