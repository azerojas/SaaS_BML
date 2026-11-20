# Fase 5: contrato de visitas y finanzas

El detalle `GET /api/visitas/{id}/` incluye `cita_para_cobro` cuando una visita
abierta sin venta tiene una única cita compatible. Prioriza la cita vinculada;
en visitas QR sin vínculo busca citas de la misma clienta dentro de la ventana
configurada, tomando como referencia la hora de registro. Si hay varias, no
selecciona ninguna. La consulta no escribe ni prepara ventas.

`POST /api/ventas/` admite `cita_id` junto a `visita_id`. Si se omite `lineas`,
prepara los tratamientos y el profesional de la cita usando `precio_snapshot`,
sin sustituirlo por el precio actual del catálogo ni exigir permiso de precio
excepcional por conservar lo reservado. El backend vuelve a validar y bloquear
la cita y la visita antes de enlazarlas. Un precio enviado por el cliente sigue
requiriendo el permiso de excepción. La operación conserva idempotencia; crea
solo un borrador, sin cobros, consumos ni finalización automática.

Estado: implementación probada y activada en Lasheo el 2026-11-06, tras autorización explícita para la migración aditiva. Se verificaron 47 tablas, 7 vistas y preservación de todas las estructuras y filas originales. En otros entornos donde falte `finanzas.0001_finance_support`, el módulo responde 503 a usuarios autorizados. No se han insertado operaciones ficticias en la base real.

El backend conserva el monolito modular. `apps/finanzas/presentation` valida DTO, sesión y permisos; `application` coordina visitas, ventas, pagos, anticipos y auditoría; `domain` contiene dinero y comandos sin HTTP; `infrastructure` implementa idempotencia y disponibilidad del esquema. Los modelos heredados siguen en `negocio` con `managed=False`. La salida de existencias utiliza el servicio público de `apps/inventario/services.py`, compartiendo locks con compras y ajustes. No hay HTTP interno entre módulos.

## Acceso y encabezados Angular

Sesión de la Fase 1, `withCredentials: true` y `X-CSRFToken` en POST/PATCH, incluida previsualización. Todos los endpoints requieren usuario activo, staff y permiso Django específico. No basta `is_staff`. El superusuario de prueba tiene acceso tras activar el esquema. No se crearon cuentas ni contraseñas adicionales.

Cada mutación exige `Idempotency-Key: <UUID no nula>`; generar con `crypto.randomUUID()` una vez por intención de negocio y conservarla durante reintentos. La clave se identifica por actor y operación; también se incluye el ID de destino en el hash. Misma clave/carga devuelve el resultado y estado HTTP originales, incluso 201. Cambiar carga o destino devuelve 409. Una operación totalmente revertida no consume la clave. La previsualización no escribe y no necesita clave.

No hay expiración automática ni purga de claves: `expires_at` queda null. El resultado persistido contiene IDs, estados e importes, sin notas, nombres, teléfono, referencia bancaria o secretos. Los permisos se vuelven a comprobar incluso para replays.

Enviar dinero y cantidades como **cadenas JSON**: `"20.00"`, `"0.300"`; se rechazan números JSON, campos desconocidos, totales, costos, autor, fecha y estado enviados por el cliente. Booleanos reales `true/false`, no cadenas. PEN, dinero 2 decimales, costos 4 y cantidades 3. Los GET devuelven decimales como cadenas. Fechas ISO con zona; filtros de fecha se interpretan en America/Lima.

## Endpoints

Todas las rutas tienen barra final. `GET` de consulta requiere `finanzas.view_finance`; cada mutación usa el permiso de la tabla (prefijo `finanzas.`). OpenAPI completo: [openapi.json](openapi.json), regenerable con `python scripts/update_finance_openapi.py`.

| Ruta | Métodos | Permiso de escritura / efecto |
|---|---|---|
| `/api/visitas/` | GET, POST | `manage_visits`: abrir visita |
| `/api/visitas/{id}/` | GET, PATCH | `manage_visits`: editar notas abiertas |
| `/api/visitas/{id}/cancelar/` | POST | `manage_visits`: cancelar sin venta vigente |
| `/api/visitas/{id}/finalizar/` | POST | `manage_visits`: finalizar con venta confirmada |
| `/api/ventas/` | GET, POST | `manage_sales`: borrador |
| `/api/ventas/profesionales/` | GET | Profesionales activos configurados |
| `/api/ventas/{id}/` | GET, PATCH | `manage_sales`: reemplazar líneas o cabecera de borrador |
| `/api/ventas/{id}/previsualizar/` | POST | `view_finance`: lectura con CSRF, sin clave |
| `/api/ventas/{id}/confirmar/` | POST | `confirm_sale`: consumos, stock y cierre atómicos |
| `/api/ventas/{id}/anular/` | POST | `manage_sales`: solo borrador |
| `/api/ventas/{id}/pagar/` | POST | `register_payment`: cobro parcial o total |
| `/api/ventas/{id}/anticipos-aplicables/` | GET | Anticipos confirmados disponibles de la misma atención |
| `/api/ventas/{id}/aplicar-anticipo/` | POST | `apply_advance`: aplicación parcial o total |
| `/api/pagos/` | GET | Pagos e historial |
| `/api/pagos/{id}/` | GET | Detalle |
| `/api/pagos/{id}/anular/` | POST | `void_payment`: corregir error de registro |
| `/api/anticipos/` | GET, POST | `manage_advances`: crear pendiente |
| `/api/anticipos/{id}/` | GET | Detalle y disponible |
| `/api/anticipos/{id}/confirmar/` | POST | `manage_advances`: confirmar dinero verificado |
| `/api/anticipos/{id}/anular/` | POST | `manage_advances`: solo pendiente |

Precio excepcional exige además `override_price`, `precio_unitario` y `motivo_precio` (8–250 caracteres); toda indicación explícita de precio exige ese permiso, aunque coincida con catálogo. Se auditan precio anterior, nuevo y motivo. Los permisos de este módulo no convierten los endpoints antiguos de catálogo/inventario en roles de caja: esas fases conservan su política previa de personal de confianza.

Listas paginadas `{count,next,previous,results}`, `page`, `page_size` (1–100, predeterminado 20). Orden descendente por fecha/ID; profesionales por apellido/nombre/ID. Filtros:

- Visitas: `clienta`, `llegada`, `cita`, `estado`, `desde`, `hasta` sobre inicio.
- Ventas: `clienta`, `visita`, `estado`, `desde`, `hasta` sobre creación.
- Pagos: `venta`, `estado`, `desde`, `hasta` sobre pago.
- Anticipos: `cita`, `estado` (incluye lectura REEMBOLSADO heredado), `desde`, `hasta` sobre creación.

IDs positivos y fechas válidas; rango invertido o estado inválido da 400. No hay DELETE de operaciones monetarias. Confirmación, pago, aplicación y cancelación conservan historial.

## Flujo de atención y venta

1. POST visitas con `{ "clienta_id": 1 }`; opcionales `llegada_id`, `cita_id`, `notas`. La ficha debe estar activa y validada. Llegada CONFIRMADA, misma clienta y sin visita previa. Cita PROGRAMADA/CONFIRMADA, misma clienta, sin otro vínculo. El QR nunca genera cargos.
2. POST ventas con `visita_id` y `lineas`. Para mostrador se omite visita y solo se admiten productos; clienta opcional. La venta de atención toma la clienta de su visita y rechaza otra. Una venta por visita, incluso si luego se anula.
3. GET venta para obtener IDs de líneas. PATCH `lineas` reemplaza la colección entera: conservar `id` de cada línea a editar, omitirlo para nuevas, excluir líneas a retirar. No cambiar referencia/tipo sobre un mismo ID. Descuento de línea omitido en una línea reenviada se restablece a cero. Omitir `lineas` conserva la colección. Descripción, precio y comisión se congelan al crear la línea; mantener ID conserva precio/descripcion y porcentaje del mismo profesional. El costo se fija al confirmar.
4. POST previsualizar `{}` devuelve receta sugerida, totales, stock agregado, costo estimado o null si desconocido; no reserva ni descuenta. Puede recibir la misma estructura `consumos_reales` de confirmación, sin `consumos_revisados`. Se revalida todo al confirmar.
5. Revisar cantidades realmente utilizadas; POST confirmar con booleano verdadero y un grupo por cada línea SERVICIO. `insumos: []` declara explícitamente ningún consumo. Las líneas PRODUCTO no llevan grupo. Cantidad real es la total para esa línea, ya incluye cantidad de servicios; no se multiplica otra vez. No se aplica receta automáticamente. Máximo 100 líneas, 300 consumos reales totales, sin repetir artículo por servicio.
6. La confirmación congela importes y costos, crea cada consumo y salida exactamente una vez, marca CONFIRMADA y finaliza visita en una sola transacción. Después se pueden registrar cobros parciales y aplicaciones de anticipo con saldo pendiente.

SERVICIO requiere `servicio_id`, cantidad entera, profesional opcional; PRODUCTO requiere `articulo_id`, `unidad_id`, artículo VENTA/AMBOS. Insumos reales INSUMO/AMBOS. Unidades deben coincidir con unidad base del artículo: no hay conversión implícita. Todo artículo/servicio/profesional usado debe estar activo.

Una visita ABIERTA sin venta puede cancelarse; con borrador, primero anularlo. No se cancela visita con venta confirmada. Confirmar venta finaliza una vez; finalizar nuevamente con otra clave devuelve conflicto. Notas solo editables mientras ABIERTA. No se permite reabrir ni generar una segunda venta para la misma visita anulada; requiere atención nueva.

## Importes, cobros y anticipos

Reglas y justificación: [decisiones-financieras.md](../apps/finanzas/references/decisiones-financieras.md).

`neto_linea = ROUND_HALF_UP(cantidad × precio_unitario − descuento_linea, 2)`; descuento no supera bruto sin redondear. `subtotal = Σ netos`; `total = subtotal − descuento_global + propina`. Descuento global entre cero y subtotal. No se calculan impuestos adicionales ni comprobantes fiscales. La propina se conserva aparte del margen del negocio.

`cobertura_total = pagos CONFIRMADOS + aplicaciones de anticipos`; `saldo_pendiente = total − cobertura_total`. No se admite sobrepago, ni monto cero/negativo. Confirmar atención no significa cobrar. GET detalle devuelve `saldo` y `finanzas_congeladas`; mutaciones devuelven resultado mínimo (para ventas/cobros, resumen financiero con `venta_id`, importes, cobertura y saldo), no el detalle completo. Obtener GET después de una respuesta idempotente para saldo actual, porque el replay conserva su resultado original.

POST pagar: `metodo`, `monto`, `verificado_manualmente: true`, `referencia`. Métodos: EFECTIVO, YAPE, PLIN, TRANSFERENCIA, TARJETA, OTRO. Referencia obligatoria salvo efectivo, normalizada sin espacios y en mayúsculas; se bloquea duplicación de método/referencia activa entre pagos y anticipos. No hay verificación bancaria automática. Efectivo con claves distintas representa cobros distintos, limitados por saldo; el cliente debe conservar la clave para evitar doble clic.

Anticipo: crear PENDIENTE sobre cita compatible; confirmar solo tras verificación manual (se puede aportar referencia/método entonces). Suma confirmada de la cita no supera su precio. La aplicación requiere venta confirmada, cita vinculada a su visita y misma clienta; no cita cancelada/expirada/no asistida. Se limita por disponible del anticipo y saldo de venta. Se registra en `aplicaciones_anticipo`, sin generar pago nuevo ni modificar `anticipos_cita.venta_id`.

Ejemplo: anticipo cobrado 30, venta 100, aplicaciones 10+20, pago posterior 70: cobertura 100, saldo 0, dinero ingresado 30+70, nunca 130. La fecha de caja del anticipo es su confirmación original; aplicar no es otro ingreso.

Vínculo antiguo `anticipos_cita.venta_id` sin aplicaciones nuevas cuenta una sola vez por monto confirmado. No se reaplica. Vínculo antiguo mezclado con pagos o con nuevas aplicaciones se bloquea para conciliación: no se puede inferir si un pago importado ya representaba el anticipo. No se convierten datos antiguos automáticamente.

Anular pago requiere permiso separado, `motivo` y `error_registro_confirmado: true`: conserva registro ANULADO y reabre saldo, sin devolver dinero ni stock. Anticipos confirmados, ventas confirmadas y aplicaciones no se revierten con anulaciones simples; devuelven 409 hasta disponer de compensación trazable aprobada.

## Errores y concurrencia

400 validación; 403 sesión/permiso/CSRF; 404 objeto inexistente; 409 conflicto de estado, stock, saldo, conciliación o clave; 503 esquema pendiente. Errores de negocio `{code,detail}`; validación DRF puede devolver errores por campo. No tratar todos los 409 como éxito. Para `reintentar_transaccion`, reintentar con la misma clave/carga. Pérdida de respuesta: igual clave; no inventar una nueva.

La transacción de idempotencia cubre auditoría y todas las escrituras. Se toma un advisory lock global financiero, luego lock compartido de clientas/check-in, filas de operación y locks de inventario de Fase 3 con artículos ordenados. Eso serializa escrituras financieras: privilegia integridad frente a rendimiento. Compras/ajustes y ventas usan la misma exclusión de inventario. Se agrega la necesidad de un artículo vendido y consumido antes de verificar stock. Las UNIQUE heredadas de movimientos son defensas adicionales. Un fallo revierte movimientos, consumos, estados, auditoría y clave.

Las garantías corresponden a estos servicios y a las defensas SQL existentes; escrituras SQL externas que eludan servicios no están autorizadas como flujo del sistema. Antes de escalar concurrencia, medir y revisar locks sin retirar las pruebas de carrera.

## Migración y verificación

Revisar [propuesta aditiva](../apps/finanzas/references/schema-map.md) y [SQL exacto](migrations/phase5-additive.sql). La migración ya está aplicada en Lasheo por autorización del usuario; no es necesario repetirla para iniciar. `python scripts/phase5_activation.py` solo exporta SQL; el modo `--apply --database-name Lasheo` requiere autorización explícita en cualquier otro despliegue. Ese modo respalda y verifica tablas originales, columnas, restricciones, índices, triggers, vistas y huellas de filas. Añade dos tablas y permisos Django; no altera tablas heredadas. La verificación posterior de solo lectura se ejecuta con `python scripts/phase5_verify.py`; el modificador `--compare-preactivation-business-rows` se usó inmediatamente después de activar, antes de nuevas operaciones. `phase5_snapshot.py` compara el esquema anterior y ya no corresponde usarlo para verificar el esquema ampliado.

Pruebas: `python manage.py test --noinput`; runner crea PostgreSQL aleatorio `test_lasheo_phase1_*`, carga el SQL heredado y aplica migraciones en aislamiento. No usar `--keepdb`/`--parallel`. Restauración de respaldo: `python scripts/verify_backup.py --phase 5`, también aislada.

Inventario y resultados de entrega: [test-checklist.md](../apps/finanzas/references/test-checklist.md). Ejemplos JSON: [api-examples.json](../apps/finanzas/examples/api-examples.json). No se implementaron Angular, WhatsApp, microservicios ni pasarela de pago.
