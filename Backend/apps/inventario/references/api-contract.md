# API administrativa de inventario — fase 3

Contrato consolidado: [OpenAPI 8.4.0](../../../docs/openapi.json).
Todos los endpoints exigen usuario activo con is_staff y sesión Django. POST/PATCH requieren X-CSRFToken y cookies; seguir el login de fase 1. Las clientas no crean usuarios. No hay rutas públicas de inventario, costos o proveedores.

Se conserva el formato de errores existente: code, detail y errors cuando hay validación. Esto mantiene compatibilidad con Angular y fases anteriores; no se cambia a message/details del ejemplo de la skill.

## Endpoints

| Método | Ruta | Comportamiento |
|---|---|---|
| GET / POST | /api/proveedores/ | Lista privada / alta |
| GET / PATCH | /api/proveedores/{id}/ | Detalle / edición |
| POST | /api/proveedores/{id}/desactivar/ | Baja lógica idempotente |
| POST | /api/proveedores/{id}/reactivar/ | Reactivación idempotente |
| GET / POST | /api/compras/ | Compras recientes / crear BORRADOR |
| GET / PATCH | /api/compras/{id}/ | Detalles / editar solo BORRADOR |
| POST | /api/compras/{id}/recibir/ | Recepción completa, idempotente por ID de compra |
| POST | /api/compras/{id}/anular/ | Solo BORRADOR a ANULADA; reintento devuelve misma compra |
| GET | /api/inventario/stock/ | Stock de la vista, mínimos y costo histórico estimado |
| GET | /api/inventario/movimientos/ | Kardex por fecha e ID ascendente |
| GET | /api/inventario/movimientos/{id}/ | Movimiento confirmado |
| POST | /api/inventario/ajustes/ | Entrada/salida justificada con Idempotency-Key |
| GET | /api/inventario/alertas/ | Bajo mínimo o vencimiento observado |
| GET | /api/inventario/costos-receta/{id}/ | Estimado histórico de receta, privado |

No hay DELETE de proveedores, compras o movimientos ni edición de movimientos. Este módulo no ofrece devolución a proveedor. Ventas y consumo pertenecen a los módulos financieros posteriores y no se incorporan a las pantallas de frontend Fase 3.

## Integración frontend Fase 3

Sin tablas nuevas ni migraciones: POST compras acepta `Idempotency-Key` UUID, obligatorio en la nueva UI y opcional para clientes anteriores. Auditoría existente conserva hash del cuerpo, actor, clave e ID; un bloqueo transaccional PostgreSQL serializa creaciones concurrentes. Repetir devuelve 200 y la compra existente; cambiar el cuerpo con una clave confirmada devuelve 409.

- GET `/api/compras/estado-intento/?clave=uuid`: `{encontrada,compra}` del actor autenticado; requiere view_compras.
- GET `/api/inventario/ajustes/estado/?clave=uuid`: `{encontrado,resultado}` del actor; requiere view_movimientosinventario. El saldo recuperado corresponde al registro original: consultar stock para saldo actual.
- GET `/api/inventario/stock/resumen/`: conteos globales activos y últimos cinco movimientos. Requiere view_articulos; los movimientos son null sin view_movimientosinventario.
- GET `/api/inventario/stock/usos-receta/?articulo=id`: recetas paginadas, requiere también view_servicios.
- Stock añade sku, categoria_id, categoria_nombre, activo, unidad_id; filtro compra por subconsulta sin multiplicar filas. Movimientos añade registrado_por_id, sin exponer otros datos personales.

Las consultas de estado no garantizan que una operación aún en vuelo haya terminado: ante resultado no encontrado se conserva el mismo UUID para el reintento. La clave no impone unicidad global del número de documento; dos intenciones independientes pueden representar documentos distintos o duplicados y requieren control operativo.

Respuestas de creación: 201. Lecturas, edición, recepción y anulación: 200. Ajuste repetido: 200 con el mismo resultado original; primer ajuste: 201.

## Ejemplos ficticios

POST /api/proveedores/:

```json
{
  "nombre":"Distribuidora de prueba",
  "ruc":"RUC-FICTICIO",
  "telefono":"+51999123456",
  "email":"proveedor@example.com"
}
```

Nombre obligatorio de hasta 160 caracteres con espacios normalizados. RUC es texto opcional hasta 20, sin unicidad ni validación legal/checksum en esta fase. Email opcional validado. Teléfono opcional con la normalización peruana/internacional de fase 1. Ningún contacto se publica ni se copia a auditoría.

POST /api/compras/:

```json
{
  "proveedor_id":1,
  "numero_documento":"FICTICIO-001",
  "observaciones":"Compra de demostración",
  "detalles":[
    {
      "articulo_id":10,
      "unidad_id":3,
      "cantidad":"5.000",
      "costo_unitario":"1.2500",
      "numero_lote":"LOTE-FICTICIO",
      "vencimiento":"2027-01-31"
    }
  ]
}
```

Los IDs deben provenir de las respuestas de la base utilizada; son ilustrativos. El ejemplo no se inserta en Lasheo.

Proveedor nullable. fecha opcional, no futura, con offset horario ISO 8601; si se omite la asigna PostgreSQL. Máximo 200 líneas. Puede crearse un borrador vacío con {}. Unidad es una confirmación de la unidad vigente del artículo; no se guarda una columna nueva ni se convierte un empaque. La respuesta devuelve esa unidad desde el artículo, cuya modificación queda bloqueada por los detalles existentes.

Cantidad: cadena decimal obligatoria NUMERIC(14,3), positiva. Costo: cadena decimal obligatoria NUMERIC(12,4), no negativo. Se rechazan números JSON, escala excesiva y campos desconocidos; así no se pierde precisión durante el parseo float de JSON. Lote opcional máximo 80; vencimiento fecha válida opcional.

total, estado, creado_por_id y otros campos de servidor no se aceptan. Total = suma sin redondear de cantidad*costo_unitario, cuantizada una sola vez a dos decimales usando ROUND_HALF_UP. Moneda PEN. Sin IGV, impuestos ni descuentos implícitos.

PATCH /api/compras/{id}/ acepta los campos de creación. Si incluye detalles, sustituye la lista completa mientras la compra sea BORRADOR. Si omite detalles conserva las líneas. El total siempre se calcula en servidor. No se permite editar RECIBIDA ni ANULADA.

POST /api/compras/{id}/recibir/ usa cuerpo vacío {}. Requiere al menos una línea, artículos y proveedor activos cuando hay proveedor, unidades de stock y mercadería que no esté ya vencida. Recalcula total; genera un COMPRA positivo por línea y cambia estado en una transacción. Un reintento devuelve 200 y no crea movimientos ni auditorías nuevas. Sigue siendo idempotente si después se desactivan artículos/proveedor o pasa el vencimiento: la validación de una recepción ya confirmada verifica sus fuentes, no vuelve a recibirla.

POST anular/ usa cuerpo vacío y no permite anular una compra recibida. Un borrador con movimientos inconsistentes se bloquea para revisión, sin borrar ni reconstruir el ledger.

La creación de borradores no es idempotente: el frontend conserva el ID y reintenta recibir sobre ese ID. No hay unicidad artificial de documento, proveedor o RUC.

POST /api/inventario/ajustes/:

Cabecera Idempotency-Key: UUID no nula de 36 caracteres generada por el cliente para esa operación.

```json
{
  "articulo_id":10,
  "unidad_id":3,
  "tipo":"AJUSTE_SALIDA",
  "cantidad":"1.000",
  "justificacion":"Corrección tras conteo físico"
}
```

Solo AJUSTE_ENTRADA y AJUSTE_SALIDA. Cantidad positiva en ambos casos; el servidor aplica el signo. Justificación normalizada de 8 a 1000 caracteres, artículo activo y unidad correcta. Sin costo de movimiento, actor, cantidad firmada ni fuentes aportadas por el cliente.

Respuesta:

```json
{
  "movimiento_id":123,
  "articulo_id":10,
  "motivo":"AJUSTE_SALIDA",
  "cantidad_firmada":"-1.000",
  "saldo_resultante":"4.000",
  "costo_unitario":"0.0000",
  "valoracion":"NO_VALORIZADO",
  "moneda":"PEN"
}
```

Los ajustes corrigen cantidades; no se decidió todavía una política contable de costo de salida. El cero almacenado en el campo obligatorio del ledger es un placeholder identificado como NO_VALORIZADO, no un costo de adquisición gratuito ni un estimado válido. La consulta de costos ignora ajustes y devuelve null si faltan compras válidas. Una compra verdaderamente gratuita sí tiene costo de adquisición cero y cuenta como dato válido.

La clave se limita a cuenta + UUID. Reintentos con el mismo payload efectivo devuelven el mismo resultado y saldo original, incluso si hay movimientos posteriores. Otra carga con la misma clave da 409 idempotencia_conflicto. Otro usuario tiene un ámbito distinto. La evidencia de idempotencia reside en auditoria; no eliminar eventos AJUSTAR ni sus claves mientras deban admitirse reintentos. Bloqueo advisory transaccional compartido entre procesos, sin caché local ni tabla nueva.

## Listados y filtros

Formato count, next, previous, results; page=1, page_size=20, máximo 100. Errores por página inexistente: 404. page_size inválido: 400. Todas las respuestas mantienen Cache-Control: no-store, private.

| Recurso | Filtros |
|---|---|
| Proveedores | search por nombre/RUC/teléfono; activo=true|false|all; page, page_size |
| Compras | search por documento; proveedor (ID), estado=BORRADOR|RECIBIDA|ANULADA; desde, hasta; page, page_size |
| Stock | search por nombre/unidad; articulo, categoria, tipo=INSUMO|VENTA|AMBOS, activo=true|false|all, bajo_minimo=true|false|all, sin_movimientos=true|false|all |
| Movimientos | search por nombre de artículo; articulo, compra, motivo, desde, hasta |
| Alertas bajo mínimo | tipo=bajo_stock (default), articulo, categoria, tipo_articulo, search, paginación |
| Alertas de fechas | tipo=vencimiento, articulo, dias=30 (0..365), estado=vencido|proximo|all |

desde/hasta son fechas de calendario de America/Lima, inclusivas; se convierten a límites temporales con timezone. Compras ordenadas por fecha e ID descendentes; kardex por fecha e ID ascendentes; stock y proveedores por nombre e ID. No se permite ordering arbitrario.

Stock por defecto solo de artículos activos. La vista conserva bajo_minimo = existencia <= stock_minimo; con mínimo cero y sin movimientos devuelve true. tiene_movimientos permite distinguir una existencia cero de un artículo todavía sin cargas. Disponible público sigue siendo existencia>0; no representa una reserva ni garantía de venta.

Alertas de vencimiento solo consideran detalles de compras RECIBIDA y fechas hasta hoy+dias, incluidos vencidos. No incluyen BORRADOR/ANULADA. Devuelven la cantidad comprada y existencia_lote=null, con advertencia de que no hay control de saldo actual por lote. Recibir mercadería ya vencida está bloqueado; la alerta también cubre compras que vencen después de recibirse y registros heredados.

## Costos estimados

Política PROMEDIO_PONDERADO_COMPRAS_RECIBIDAS_HISTORICAS:

`SUM(cantidad_firmada*costo_unitario) / SUM(cantidad_firmada)`

Solo COMPRA positivo enlazado a una línea de compra RECIBIDA. Se usan los snapshots del movimiento. Ajustes, borradores, anuladas y fuentes no verificables se excluyen. El promedio se informa con 4 decimales; la estimación de receta suma con precisión ampliada y redondea al final a 2 decimales, ROUND_HALF_UP. El total puede diferir de la suma de líneas ya redondeadas.

Si un insumo carece de costo válido, su costo y el total de receta son null, completo=false. Una receta vacía también devuelve null. No se sustituye por precio de venta, última compra arbitraria ni cero. El endpoint privado de receta de fase 2 mantiene costo_estimado=null para preservar su contrato; la nueva consulta explícita es la fuente del estimado de fase 3.

No es promedio móvil contable, FIFO, costo por lote ni utilidad real. Compras capitalizan inventario en el modelo del sistema; no se deben sumar otra vez como gasto de tratamiento. El costo de consumo y su reconocimiento corresponde a una decisión y snapshots de fase 5.

## Conflictos y límites

400: campos, referencias, escala, unidad incompatible, compra vacía, vencimiento pasado en recepción, tope de total o existencias. 403: sesión/rol/CSRF. 404: recurso inexistente. 405: edición/borrado de ledger o DELETE de compras/proveedores. 409: estado_compra, articulo_inactivo, proveedor_inactivo, stock_insuficiente, idempotencia_conflicto, integridad_compra, movimiento_duplicado.

COMPRA y AJUSTE_ENTRADA son positivos; AJUSTE_SALIDA es negativo. La lectura de kardex admite motivos heredados/futuros, pero estas rutas no crean CONSUMO_SERVICIO ni VENTA_PRODUCTO. DEVOLUCION en SQL solo admite entrada positiva; no existe devolución a proveedor en esta fase. Una compensación se registra como un nuevo ajuste justificado, con su propia clave, sin alterar el movimiento original.

Existencias máximas: 99999999999.999. Total de compra máximo: 9999999999.99. Se validan en servidor antes de escribir. No se inventaron tablas ni restricciones nuevas.

