# Agenda y reservas — Fase 7

Estado: implementación probada y diez permisos activados en Lasheo el 2026-11-10, tras autorización explícita. Se verificaron consultas privadas HTTP 200 y preservación de las 47 tablas, siete vistas y filas de negocio. No se creó, reprogramó, canceló, expiró ni retiró información de agenda en la base real durante desarrollo o activación. El ámbito entregado es **agenda privada operativa y consultas públicas opcionales de solo lectura**. No hay alta/cancelación pública sin identidad verificada, WhatsApp, mensajes automáticos ni frontend.

Se ejecutaron primero las 267 pruebas anteriores. La auditoría real encontró 47 tablas físicas (34 originales de negocio más infraestructura y soporte de fases previas), siete vistas, 13 FK de usuarios restauradas, EXCLUDE de citas/profesional/clienta/horarios, función de slots y triggers de historial. Se reutilizan esos objetos sin recrearlos o alterar SQL histórico. [ADR y esquema](../apps/agenda/references/schema-map.md), [reglas](../apps/agenda/references/booking-rules.md), [seguridad](../apps/agenda/references/security.md), [pruebas y entrega](../apps/agenda/references/test-checklist.md).

## Capas e integraciones

`apps/agenda/presentation` valida DTO, sesión, permisos y adapta HTTP; `application` coordina administración, reservas, expiración, disponibilidad y espera; `domain` contiene intervalos, estados, anticipos y comandos inmutables; `infrastructure` consulta ORM existente y controla locks/idempotencia. No se duplican modelos de negocio ni se usa HTTP entre módulos.

Integra los servicios públicos de check-in para crear/vincular visita a llegada confirmada y el servicio financiero existente para confirmar/aplicar anticipos. Cita ≠ llegada ≠ visita ≠ venta ≠ pago. Crear una cita no genera visita, venta o cobro. Confirmar llegada no confirma dinero. Completar cita exige visita finalizada con venta confirmada de la misma clienta, pero puede quedar deuda.

La disponibilidad privada/pública es propuesta de huecos de un profesional, **no reserva ni verificación del calendario de una clienta**. Crear/reprogramar revalida también conflictos de clienta, límites, vigencia y bloqueos dentro de una transacción. No garantizar una reserva por haber mostrado un slot.

## Acceso, sesión y permisos

Prefijo privado `/api/v1/agenda/`. Sesión de Fase1 con `withCredentials: true`, `X-CSRFToken` en POST/PUT/PATCH/DELETE e `Idempotency-Key` UUID no nula por intención. Conservar clave/carga/destino en reintentos; replay devuelve resultado y status anteriores, incluso201. Misma clave con cambio de carga/destino da409; fallo completo no consume clave. Respuesta persistida mínima: IDs, estado, fechas e importes, sin nombres, notas, teléfono, código o token.

Todos los GET privados requieren `agenda.view_agenda`, cuenta activa y staff; cada escritura requiere permiso por acción. `is_staff` solo no concede acceso. No se amplió la política previa de roles de los otros módulos.

| Permiso | Escrituras autorizadas |
|---|---|
| `manage_professionals` | Alta/cambio/desactivación y especialidades |
| `assign_users` | Adicional para indicar usuario_id, incluso para retirarlo; usuario destino activo y staff |
| `manage_schedules` | Crear/editar/retirar horario |
| `manage_blocks` | Crear/editar/retirar bloqueo |
| `manage_appointments` | Crear/reprogramar/cancelar/confirmar/completar/no asistencia/expirar |
| `manage_waitlist` | Solicitud, oferta manual, cancelación y conversión de espera |
| `link_arrivals` | Vincular llegada confirmada con cita/visita |
| `configure_agenda` | Cambiar configuración existente id1 |
| `override_policy` | Adicional para cancelación fuera de plazo o bloqueo histórico expresamente indicado |

Convertir espera exige también manage_appointments. Anticipos siguen usando `finanzas.manage_advances`, aplicación a venta `finanzas.apply_advance`; no se crean permisos financieros equivalentes en agenda. Superusuario conserva acceso al activar metadata; no se crearon credenciales nuevas.

JSON estricto: campos desconocidos rechazados; dinero/comisión como cadenas (`"20.00"`), booleanos reales. Timestamps ISO8601 con offset obligatorio (`2026-11-10T10:00:00-05:00`); no aceptar hora ingenua del dispositivo. Fechas `YYYY-MM-DD`, horas semanales/franjas `HH:MM` o `HH:MM:00`, sin zona ni segundos distintos de cero. Moneda PEN, America/Lima; almacenar instantes con zona. No se aceptan precio, anticipo, duración, estado, autor, código o token arbitrarios al crear cita.

## Endpoints privados

Todas las rutas llevan barra final. No DELETE de profesionales, citas o espera. DELETE de horario/bloqueo es un retiro operativo explícito y auditado, requiere cuerpo `{ "confirmar_retiro": true, "motivo": "..." }` más permiso, CSRF y clave. No se ejecutó sobre Lasheo durante esta implementación. Conserva snapshot del intervalo/motivo en auditoría; nunca borra citas en cascada.

| Ruta bajo `/api/v1/agenda/` | Métodos / finalidad |
|---|---|
| `profesionales/` | GET, POST |
| `profesionales/{id}/` | GET, PATCH (activa=false desactiva, sin borrar historial) |
| `profesionales/{id}/especialidades/` | GET, PUT `{servicios:[...]}` reemplaza conjunto |
| `horarios/` | GET, POST |
| `horarios/{id}/` | GET, PATCH, DELETE con retiro explícito |
| `bloqueos/` | GET, POST; profesional_id=null bloquea toda la tienda |
| `bloqueos/{id}/` | GET, PATCH, DELETE con retiro explícito |
| `citas/` | GET, POST |
| `citas/{id}/` | GET: snapshots, anticipo confirmado/pendiente e historial |
| `citas/{id}/reprogramar/` | POST fecha/profesional y opcional servicios nuevos |
| `citas/{id}/cancelar/` | POST motivo; no reembolso automático |
| `citas/{id}/confirmar/` | POST `{}`: PROGRAMADA→CONFIRMADA, no cobro |
| `citas/{id}/no-asistio/` | POST motivo, solo tras fin previsto y sin visita |
| `citas/{id}/completar/` | POST `{}`: atención/venta coherentes ya finalizadas |
| `citas/{id}/vincular-llegada/` | POST `{llegada_id:...}`, recepción ya confirmada |
| `citas/expirar/` | POST `{}`, revisa hasta500 vencidas; clave nueva en cada ejecución lógica |
| `lista-espera/` | GET, POST |
| `lista-espera/{id}/` | GET; cita_id proviene del evento auditable de conversión |
| `lista-espera/{id}/oferta-manual/` | POST `{oferta_registrada_manualmente:true}`; no envía mensaje |
| `lista-espera/{id}/convertir/` | POST inicio_en/profesional compatible; reserva y resuelve espera atómicamente |
| `lista-espera/{id}/cancelar/` | POST motivo |
| `calendario/` | GET citas intersectando rango, requiere desde/hasta |
| `calendario/disponibilidad/` | GET fecha/profesional/servicios, sin escrituras |
| `calendario/configuracion/` | GET, PATCH de política actual; no cambia retroactivamente snapshots/anticipos de citas existentes |

Listas privadas paginadas `{count,next,previous,results}`, page_size20 por defecto y máximo100. Orden profesional por apellidos/nombres/ID; citas/bloqueos por inicio/ID; horarios por profesional/día/hora/ID; espera por fecha/ID. Filtros:

- Profesionales: `activa=true|false`, `servicio_id`.
- Horarios: `profesional_id`.
- Citas/calendario: `profesional_id`, `clienta_id`, `estado`, `desde`, `hasta`.
- Bloqueos: `profesional_id`, `desde`, `hasta`; omitir profesional para incluir globales.
- Espera: `profesional_id`, `clienta_id`, `estado`, `desde`, `hasta` por fecha deseada.

Rangos `[desde,hasta)` de fechas locales, hasta exclusiva, máximo93 días. Citas/bloqueos se seleccionan por intersección del intervalo, incluidos bloqueos iniciados antes del rango. Ambos extremos o ninguno salvo calendario, donde son obligatorios. Filtros repetidos/desconocidos o teléfono se rechazan. Angular combina citas de calendario, horarios y bloqueos desde sus endpoints; el calendario no mezcla pagos con citas.

## Disponibilidad y reserva

`GET calendario/disponibilidad/?fecha=2026-11-10&profesional_id=1&servicios=1,2`

Lista de1 a10 IDs de servicio distintos en orden, un servicio por registro (sin cantidades repetidas). El profesional debe estar activo y habilitado para todos. Duraciones positivas, total máximo720 minutos. Para público, profesional visible y todos los servicios activos/visibles/reservables_online. Sin duración o política de anticipo contradictoria se rechaza, no se inventa valor.

Horarios ISO lunes1–domingo7, inicio<fin, sin cruzar medianoche. Se generan pasos desde hora_inicio de cada tramo con `intervalo_slots_minutos`; cita debe caber en un solo tramo y comenzar alineada. Se permite contacto entre intervalos `[inicio,fin)`. Bloqueos globales/profesional y citas PENDIENTE_PAGO/PROGRAMADA/CONFIRMADA ocupan. Disponibilidad no revela quién ocupa el hueco ni lista citas ajenas.

Se aplican anticipación mínima y máxima desde el instante del servidor, máximo operativo366 días aunque un legado configure más. Reservas privadas respetan esas ventanas; bloquear pasado exige excepcion_historica=true y override_policy. Cambio/retiro de horario no puede dejar citas activas futuras fuera de los tramos restantes; desactivar profesional o quitar especialidad con citas futuras se bloquea hasta resolverlas. Crear bloqueo sobre citas activas se rechaza: no cancela ninguna silenciosamente.

POST citas recibe clienta activa/validada, profesional, servicios, inicio y opcionales notas/origen MANUAL o TELEFONO. No acepta WHATSAPP/ONLINE. SQL genera codigo_reserva y UUID token_gestion; son únicos, pero **no se exponen ni se usan como autorización de una API pública**. Colisión de código produce409 reversible y puede reintentarse con la misma clave. Se guardan CitaServicios con orden/precio/duración snapshots y se usa el trigger existente para un único evento inicial de estado, completado con actor/origen/detalle.

Reprogramar solo cita activa no iniciada, sin visita, ni pendiente ya vencida. Omitir servicios conserva precios/duraciones/anticipo originales aunque cambie catálogo; lista explícita toma snapshots actuales, auditando los anteriores y nuevos. Anticipo cobrado no se pierde ni puede superar el nuevo precio. Si falta anticipo adicional, pasa a PENDIENTE_PAGO con vencimiento; si ya estaba pendiente no se extiende indefinidamente su plazo. Se valida el nuevo hueco antes de modificar. Auditoría conserva fechas/profesional y snapshots anteriores/nuevos; no se duplica historial de estado por mover una hora.

Cancelación administrativa cumple horas_limite_cancelacion; fuera de plazo necesita fuera_plazo_autorizado=true y override_policy. Siempre motivo, timestamp y cancelada_por=NEGOCIO. Solo cita activa sin visita. Terminales no se reabren. Anticipo confirmado queda registrado, sin devolución ficticia. No asistencia tras fin previsto; completar requiere visita FINALIZADA y venta CONFIRMADA de la misma clienta, sin exigir que saldo sea cero.

## Anticipos y expiración

Precio total = SUM precio_base de servicios seleccionados. Si alguno requiere anticipo, anticipo = HALF_UP(total×porcentaje_configurado/100,2); si ninguno lo requiere,0. Una exigencia con total>0 y resultado0 bloquea para corregir política. Máximo total de la cita; dinero siempre Decimal. Anticipo requerido>0 crea PENDIENTE_PAGO, vencimiento now+minutos_expiracion_pago; si0 crea PROGRAMADA. No se crea dinero confirmado por ese hecho.

Recepción de dinero: usar POST `/api/anticipos/` y POST `/api/anticipos/{id}/confirmar/` existentes, con permisos financieros, verificación manual y referencia según medio. La misma transacción y locks de Fase5 comprueban que el plazo no venció y, al alcanzar anticipo requerido, pasan PENDIENTE_PAGO→PROGRAMADA. Pago parcial insuficiente conserva pendiente. Después se puede confirmar administrativamente la cita; no es otra confirmación de dinero. Una confirmación tardía se rechaza sin dinero ni reapertura silenciosa: requiere incidencia/conciliación externa revisada, no falsear la hora del ingreso.

El SQL `fn_slots_disponibles` ignora una pendiente vencida, pero EXCLUDE aún la ocupa. El motor nuevo **no muestra ese hueco libre** hasta transición real; no altera estados durante GET. Comando:

```powershell
.\.venv\Scripts\python.exe manage.py expirar_citas --limit 500
```

Idempotente por estado, bajo los mismos locks que pagos y reservas. Vencida con anticipo confirmado suficiente se regulariza PROGRAMADA; sin suficiente pasa EXPIRADA. Si recibió parte del dinero, se conserva y registra INCIDENCIA_ANTICIPO; no se crea reembolso/pago ni se borra anticipo. Repetir hasta procesar pendientes del lote; el comando no está programado automáticamente. Fase8 debe configurar su periodicidad y monitoreo. POST expirar usa clave nueva para cada ejecución; repetir una clave devuelve resultado antiguo y no procesa reservas nuevas.

Crear una reserva también revisa hasta500 pendientes vencidas dentro de su transacción; si la reserva completa falla, esa revisión se revierte con ella. La expiración explícita es el mecanismo para liberar lotes de forma independiente. Mientras no se procesa, la disponibilidad es conservadora, nunca un hueco falso.

Aplicar anticipo a venta sigue usando `/api/ventas/{id}/aplicar-anticipo/` con ledger de Fase5: misma cita/clienta/visita, sin generar otro pago. Cancelar/expirar no significa devolver dinero. Continúan pendientes reembolsos reales y recaudación neta conciliada de Fase6, sin bloquear el ámbito privado de agenda definido aquí.

## QR y espera

`vincular-llegada` reutiliza create_visit/link_appointment de check-in. Llegada CONFIRMADA e identidad presencial, misma clienta, cita PROGRAMADA/CONFIRMADA dentro de ventana configurada y enlace UNIQUE; rechazo revierte una visita recién creada. No empareja teléfono ni asigna automáticamente la primera cita. La bandeja QR anterior ofrece candidatos; la administradora elige. Walk-in continúa disponible por Fases4/5 si no hay cita.

Espera requiere ficha activa/validada y servicio activo con duración. Profesional opcional compatible, fecha dentro del horizonte, franja completa inicio<fin y suficientemente larga, sin noche. No duplicar solicitud activa compatible del mismo servicio/clienta/fecha/profesional/franja; máximo20 activas por clienta. Estado ACTIVA→NOTIFICADA significa oferta manual registrada, no envío de WhatsApp/email. ACTIVA/NOTIFICADA→CONVERTIDA reserva con mismas validaciones en una transacción y guarda cita_id en evento de auditoría. No hace falta nueva tabla/columna para ese vínculo, pero no se debe purgar su auditoría. Una segunda conversión se rechaza.

## Consultas públicas y seguridad

Solo GET `/api/v1/public/agenda/profesionales/`, `servicios/`, `disponibilidad/`. Requieren AGENDA_PUBLIC_READ_ENABLED y configuracion.reservas_online_activas; el flag SQL habilita esta oferta de lectura, **no una API pública de altas**. Profesional debe tener visible_reservas (alta nueva privada usa false si no se indica); nunca teléfono/usuario/comisión. Catálogo reservable mínimo. Listas acotadas100, error503 si exceden; disponibilidad una fecha/profesional y hasta10 servicios. No aceptar filtros de teléfono/identidad o tokens personales.

Throttle compartido PostgreSQL, HMAC de IP, AGENDA_PUBLIC_REQUEST_LIMIT60/minuto por defecto. No se confía en X-Forwarded-For sin infraestructura configurada. Fase8 debe completar límites de proxy, TLS y limpieza/retención de contadores. POST público devuelve405 o404 si no existe ruta de gestión. No se entrega token de reserva al navegar catálogo. Para habilitar escritura pública futura hace falta identidad verificable aprobada, consentimiento, token de sesión de reserva y pruebas contra enumeración; no basta saber un teléfono o código corto.

## Transacciones y errores

Todas las escrituras coordinadas usan la idempotencia persistente de Fase5 y transaction.atomic. Orden de locks: financiero453 → clientas/check-in451 → agenda455, después filas pertinentes. Serializa cambios de calendario y dinero para que bloqueos globales, reservas y expiración compitan bajo el mismo orden. EXCLUDE heredadas son barrera final para profesional/clienta y horarios. SQLSTATE23P01 se convierte en409 SLOT_NOT_AVAILABLE; no se filtra detalle SQL ni token. Un fallo revierte cita, líneas, trigger/historial, auditoría, conversión y clave.

400 formato/filtros/política de entrada; 403 permiso/CSRF o excepción no autorizada; 404 objeto/consulta pública no disponible; 409 intervalo/estado/clave/integridad; 429 throttle; 503 módulo/configuración no disponible. `{code,detail}` de dominio, validación por campos. No tratar409 como éxito ni generar otra clave al perder respuesta. El modelo proxy AgendaAccess solo registra diez permisos: [SQL no-op](migrations/phase7-permissions.sql). Ya se activó en Lasheo con autorización; no es necesario repetirlo al iniciar. Otros entornos requieren su propia revisión/autorización; `phase7_activation.py` sin --apply solo revisa. `phase7_verify.py` comprueba consultas autenticadas de solo lectura, sin ejecutar reservas o expiración. El baseline de `phase7_snapshot.py` es una foto anterior a operar: tras operaciones legítimas no se espera que todas las filas sigan idénticas. No correr migraciones generales ni editar SQL histórico.

Contrato completo [OpenAPI1.6.0](openapi.json), regenerable con `python scripts/update_agenda_openapi.py`; [ejemplos comprobados](../apps/agenda/examples/api-examples.json). Pruebas `python manage.py test --noinput` únicamente en PostgreSQL aleatorio del runner, sin --keepdb/--parallel. No ejecutar el comando de expiración en Lasheo como prueba: modifica reservas reales, aunque sea idempotente.
