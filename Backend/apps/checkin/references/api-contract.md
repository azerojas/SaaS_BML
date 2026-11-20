# Contrato de check-in — OpenAPI 1.3.0

El recorrido público vigente registra visitas automáticamente. La confirmación manual descrita más abajo corresponde a datos históricos. Consulta `docs/visitas-qr-automaticas.md`.

Base administrativa /api/admin/checkin/. Usuario activo con is_staff y sesiones/CSRF de fase 1. Todos los DTO y errores mantienen las convenciones anteriores: code, detail, errors. Los tokens QR no autentican personal.

## Rutas

| Método | Ruta | Acceso / resultado |
|---|---|---|
| GET/POST | /api/public/checkin/{token}/ | Anónimo limitado; configuración mínima / solicitud genérica 202 |
| GET | /api/public/checkin/aviso-prueba/ | Aviso ficticio local, solo modo demo |
| GET/POST | /api/admin/checkin/puntos/ | Listar paginado / crear, 201 |
| GET/PATCH | /api/admin/checkin/puntos/{id}/ | Detalle / cambiar nombre o activo |
| GET | /api/admin/checkin/puntos/{id}/qr/ | Enlace JSON o SVG/PNG de punto activo |
| GET/POST | /api/admin/checkin/llegadas/ | Bandeja paginada / llegada manual de ficha activa validada |
| GET | /api/admin/checkin/llegadas/{id}/ | Detalle privado, resolución, visita y citas sugeridas |
| POST | /api/admin/checkin/llegadas/{id}/confirmar/ | Confirmación humana explícita |
| POST | /api/admin/checkin/llegadas/{id}/rechazar/ | Rechazar pendiente |
| POST | /api/admin/checkin/llegadas/{id}/cancelar/ | Cancelar pendiente |
| POST | /api/admin/checkin/llegadas/expirar/ | Cancelar hasta 200 pendientes vencidas |
| POST | /api/admin/checkin/llegadas/{id}/crear-visita/ | Una visita por llegada; reintento devuelve la existente |
| POST | /api/admin/checkin/llegadas/{id}/asociar-visita/ | Asociar atención abierta existente compatible |
| POST | /api/admin/checkin/llegadas/{id}/enlazar-cita/ | Enlace explícito con cita compatible existente |

GET permite HEAD/OPTIONS cuando corresponde. No hay DELETE ni PATCH de llegadas, ni API de cobros, ventas o reservas. Las escrituras administrativas requieren cookie de sesión y X-CSRFToken. El POST público no usa sesión ni credenciales; JSON obligatorio y CORS cerrado a los orígenes existentes.

## Formulario público

GET solo devuelve establecimiento, requiere_confirmacion_presencial=false, consentimiento_preseleccionado=false, URL/versión del aviso y nombres de campos. No devuelve ID de punto/clienta/llegada, existencia de teléfono, contactos ni historial.

POST existente mínimo:

```json
{"telefono":"+51999123456"}
```

POST de propuesta de alta nueva, exclusivamente datos ficticios en este entorno:

```json
{
  "telefono":"+51999123456",
  "nombres":"Daniela",
  "apellidos":"Ficticia",
  "consentimiento_datos":true,
  "version_aviso":"PRUEBA-LOCAL-v1"
}
```

Teléfono normalizado con la política de fase 1, sin reescribir datos almacenados. Celular peruano nacional se convierte a +51. Si hay varias fichas heredadas equivalentes, no se elige una arbitrariamente ni se crea otra llegada.

Solo para una ficha nueva se necesitan nombres/apellidos, consentimiento JSON true y aviso vigente configurado. Un teléfono desconocido sin esos datos no abre ficha. Nombres/apellidos de fichas existentes nunca se actualizan desde esta ruta.

Alta nueva: clienta inactiva, consentimiento_datos=false, consentimiento_fecha=null, recordatorios false; se guarda una declaración no verificada en auditoría y una llegada PENDIENTE. No se habilita una visita antes de revisión presencial. Un tercero podría aportar datos ajenos: la administradora debe comprobar identidad y consentimiento; el QR y el teléfono por sí solos no los verifican.

La misma respuesta 202 para existente, nueva válida, desconocida incompleta, inactiva y repetición de pendiente:

```json
{"detail":"Si los datos son válidos, tu solicitud de llegada se ha recibido. Acércate a recepción para confirmarla."}
```

No hay request_id ni endpoint de seguimiento anónimo. Una respuesta genérica no acredita que exista una ficha ni que la llegada haya sido persistida cuando faltan datos válidos. No hay búsqueda pública de personas ni comprobación remota de existencia.

Una pendiente es global por clienta, no por fecha ni por punto. Mientras exista, el reintento no duplica. Una llegada ya resuelta permite una nueva solicitud; no se impone una regla inexistente de una llegada por día. Las fichas inactivas reales no se reactivan ni reciben nuevas llegadas desde público; las propuestas no verificadas pueden reintentarse sin cambiar sus nombres.

Si cambia el aviso antes de confirmar una propuesta, la nueva declaración con versión vigente queda en auditoría. El personal vuelve a verificarla; no se acepta silenciosamente una versión obsoleta.

Payload máximo 8192 bytes, application/json UTF-8, campos de lista blanca y longitudes acotadas. Errores de formato son independientes de la existencia del teléfono y no repiten el valor ingresado.

## Recepción y visitas

Confirmación:

```json
{"identidad_verificada":true,"consentimiento_verificado":true,"motivo":"Verificacion presencial"}
```

identidad_verificada es obligatorio y true. consentimiento_verificado=true también es obligatorio para una propuesta de alta y debe existir declaración de aviso vigente. Entonces se activa esa ficha y se registra consentimiento con fecha del servidor, actor y versión. En una ficha existente, confirmar no inventa ni cambia su consentimiento.

Rechazar/cancelar acepta {} o {"motivo":"..."} hasta 250 caracteres, sin datos personales innecesarios. Solo PENDIENTE puede resolverse; repetir confirmar o cambiar CONFIRMADA a PENDIENTE/RECHAZADA/CANCELADA devuelve 409. Se conservan ficha e historial.

Crear visita usa cuerpo vacío. Requiere llegada CONFIRMADA y ficha activa validada; asigna la misma clienta y el usuario servidor. Se crea ABIERTA, sin venta, pago, consumo ni movimiento de stock. El reintento devuelve 200 con la misma visita. La igualdad de fichas y unicidad se validan dentro de una transacción y con UNIQUE de PostgreSQL.

Asociar una visita existente:

```json
{"visita_id":15}
```

Solo atención ABIERTA de la misma ficha, sin otra llegada y sin otra visita ya enlazada a esa llegada. No se implementó una ruta nueva de inicio manual sin llegada: antes de fase 4 no había una política/API de ese tipo. Sí se pueden asociar visitas existentes creadas por el flujo autorizado del negocio.

Citas sugeridas: PROGRAMADA/CONFIRMADA de la misma clienta, no enlazadas, con inicio/fin dentro de la ventana operativa configurable (120 minutos antes/después de ahora). No se incluyen tokens de gestión, precios ni anticipos. Son sugerencias privadas; no se enlazan automáticamente.

Enlace explícito:

```json
{"cita_id":20}
```

Primero debe existir la visita confirmada/asociada. La cita debe seguir compatible, libre y de la misma ficha; una visita solo admite una cita. No cambia estado de cita, crea reserva, venta ni pago.

## Bandeja y vencimiento

Filtros: search (nombre/apellido/teléfono, privado), estado, punto (ID), desde/hasta inclusivos en America/Lima, vigentes=true|false|all. Por defecto oculta pendientes vencidas; otros estados siguen consultables. Orden por solicitada_en/id descendente. Paginación estándar count,next,previous,results; 20 por defecto, máximo 100.

El detalle incluye campos suficientes para confirmación y última resolución privada; no devuelve notas_privadas, nacimiento, email ni historial de visitas completo. Las fechas y el actor de la resolución se conservan en auditoría.

TTL configurado: 90 minutos. No se inventó EXPIRADA. Una pendiente vencida no puede confirmarse y pasa a CANCELADA al ejecutar el comando o la acción privada:

```powershell
.\.venv\Scripts\python.exe manage.py expire_checkins --limit 200
```

Cada fila se cancela en una transacción breve; repetir no añade otra resolución. El comando registra actor sistema; la acción privada registra al administrador solicitante. Antes de otra llegada, la pendiente anterior debe resolverse o cancelarse por esa política. El job no se programó en el sistema operativo; en despliegue debe ejecutarse periódicamente o usarse la acción privada.

## QR y errores

Crear punto: {"nombre":"Recepcion","activo":true}. token, fechas e ID de servidor no se aceptan. PostgreSQL genera UUID. La lista no muestra token; la ruta privada qr devuelve enlace activo. ?formato=svg o png genera imagen con margen de cuatro módulos y corrección de errores; no hay archivos personales ni subida a un servicio externo.

Revocar: PATCH activo=false. GET/POST públicos pasan a 404 y se impide generar otro QR de ese punto. Si se filtró el cartel, crear otro punto con UUID nuevo y sustituir el cartel; reactivar el anterior vuelve a habilitar su enlace, por lo que no equivale a rotar el token.

400: formato/campos/confirmación humana incompleta. 403: rol/sesión/CSRF privado. 404: punto inactivo/desconocido o recurso privado inexistente. 405: método no permitido. 409: transición, duplicado privado, ficha/visita/cita incompatible o llegada vencida. 415: MIME público incorrecto. 429: rate limit, con Retry-After conservador. 503: modo demo intentando servirse con DEBUG=False.

Todas las respuestas API conservan no-store. Un conflicto UNIQUE público se traduce al mismo 202 después del rollback, sin exponer existencia ni detalles SQL.

