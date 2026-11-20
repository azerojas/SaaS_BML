# Dashboard y reportes — Fase 6

Estado de implementación: endpoints y exportador implementados, con permisos activados en Lasheo el 2026-11-06 tras autorización explícita. Se aprobaron 267 pruebas y las nueve consultas autenticadas se verificaron con respuesta200 sin cambiar datos de negocio. La recaudación neta conciliada permanece **bloqueada**: no existe ledger de reembolsos ni conciliación bancaria suficiente. No se declara la fase totalmente finalizada mientras ese KPI siga bloqueado. La utilidad entregada es una estimación operativa justificable por snapshots y gastos registrados, nunca utilidad contable/fiscal certificada.

Se verificó el backend anterior ejecutando 223 pruebas antes de desarrollar esta fase. La base instalada tiene **47 tablas físicas**: 34 heredadas, infraestructura Django y dos tablas de soporte añadidas con autorización en Fase 5; conserva las siete vistas SQL. No se recrearon ni alteraron tablas, vistas o datos de negocio para implementar reportes.

## Arquitectura y reutilización

`apps/reporting/presentation` valida filtros, sesión, permisos y respuestas; `application` compone indicadores y exportaciones; `domain` define períodos y fórmulas; `infrastructure` ejecuta consultas acotadas, snapshots de lectura y openpyxl. Los modelos heredados siguen en `negocio`, sin nuevos modelos de negocio duplicados. Se reutilizan `sale_totals`, reparto exacto de descuento y comisión de Fase 5. El exportador recibe los mismos resultados que la API, sin fórmulas paralelas.

Cada reporte financiero abre una transacción PostgreSQL `REPEATABLE READ READ ONLY`, con timeout de 5 segundos por sentencia. No usa `ATOMIC_REQUESTS` ni puede anidarse en otra transacción. Varias consultas ven un mismo instante, incluso si se confirma un cobro durante la lectura. El único registro de escritura es la auditoría de exportación, fuera de esa transacción y después de generar el archivo correctamente. No crea ventas, visitas, pagos o movimientos de inventario.

## Sesión, permisos y Angular

Sesión de Fase 1 con `withCredentials: true`. Todos los endpoints de esta fase son GET privados; requieren cuenta activa staff y permiso concreto. No se agregaron endpoints públicos, WhatsApp, mensajería, frontend ni microservicios.

| Permiso | Acceso |
|---|---|
| `reporting.view_summary` | Overview, series, métodos, servicios, gastos y comparación mensual |
| `reporting.view_clients` | Ranking e indicadores privados de clientas |
| `reporting.view_inventory` | Estadísticas y alertas de inventario |
| `reporting.export` | Excel **además** del permiso de consulta del reporte elegido |

`is_staff` o `finanzas.view_finance` por sí solos no dan acceso. `view_summary` no permite ver nombres de clientas ni exportarlos. Overview incluye solo cantidades agregadas de cumpleaños e inactividad; nombres e IDs del ranking requieren `view_clients`. No hay teléfonos, email, notas, consentimiento ni fecha de nacimiento en respuestas/exportaciones de clientas. El superusuario de prueba conserva su acceso al activar los permisos. No se añadieron credenciales.

Todas las respuestas tienen `Cache-Control: no-store, private`. Dinero y cantidades JSON son cadenas decimales; nulo significa no verificable/no habilitado, nunca convertirlo a cero en Angular. Los avisos de `calidad.advertencias` deben mostrarse junto con los KPI. `generado_en` es ISO con zona.

## Fechas y filtros

Contrato nuevo `[desde, hasta)` **con hasta exclusiva**, distinto a filtros inclusivos anteriores de inventario/finanzas. Ejemplo octubre completo:

`GET /api/v1/analytics/overview/?desde=2026-10-01&hasta=2026-11-01`

Para UI con fecha final inclusiva, sumar un día de calendario local antes de enviarla. No construir `23:59:59`. Todos los límites son medianoches de America/Lima; agrupar también en Lima, no UTC del navegador. `timezone` opcional solo admite `America/Lima`. Semana lunes–domingo, mes calendario.

Alternativa `periodo=day|week|month&fecha=YYYY-MM-DD`; fecha es ancla local, hoy por defecto. Sin parámetros se consulta el día actual. Rango explícito requiere ambos extremos, opcional `periodo=custom`; no combinarlo con período predefinido/fecha. `granularidad=day|week|month` controla series y límite de rango: 366 días para day y 3660 para week/month. Inicio anterior al fin, años 1900–9998. Fechas compactas, filtros repetidos/desconocidos y ordenaciones libres se rechazan.

Filtros por endpoint (además del período):

| Reporte | Filtros particulares |
|---|---|
| overview, revenue-series | `servicio_id`, `profesional_id` |
| payment-methods | Los anteriores y `metodo` |
| top-services | Servicio/profesional, `orden=importe|cantidad`, `limit=1..100` |
| top-clients | Servicio/profesional, `orden=importe|visitas`, `limit=1..100` |
| inventory-alerts | `categoria_id` de artículo |
| expenses | `categoria_id` de gasto |
| month-comparison | **Solo** `month=YYYY-MM` |
| clients/retention | Período para metadatos; indicadores corresponden a la foto actual |

Servicio/profesional seleccionan una **cohorte de ventas completas** mediante un único EXISTS sobre la misma línea; no recortan cabeceras ni alteran el reparto del descuento global. Si una venta contiene otros servicios/productos, esos importes también forman parte de esa cohorte. `periodo.alcance_ventas` lo identifica. Cobros/anticipos de esa cohorte se filtran por su fecha propia, aunque la venta se confirmó fuera del rango. No se asignan gastos generales a una cohorte: utilidad_estimada nula con aviso. `metodo` solo se admite en métodos de pago. Categoría de gasto y artículo no se mezclan.

Ranking, inventario y gastos paginados: `{count,total_grupos,next,previous,results}`, `page` positivo hasta 5000, `page_size=1..100` (20 predeterminado). Ranking aplica `limit` primero (100 predeterminado) y pagina después; `total_grupos` informa grupos existentes antes del top. Orden estable por importe/cantidad/visitas descendente y luego ID ascendente. Otros reportes no aceptan paginación arbitraria.

## Endpoints

| Ruta | Resultado y alcance |
|---|---|
| `/api/v1/analytics/overview/` | KPI, fórmulas, calidad y límites de conciliación |
| `/api/v1/analytics/revenue-series/` | Ventas, pagos y anticipos separados por día/semana/mes, períodos vacíos a cero |
| `/api/v1/analytics/payment-methods/` | Componentes de pagos y anticipos separados por método, sin sumarlos como neto |
| `/api/v1/analytics/top-services/` | Cantidad, ingreso con descuentos, costo y comisión históricos |
| `/api/v1/analytics/top-clients/` | Clientas con venta confirmada en rango; nombre mínimo, monto de venta y visitas finalizadas |
| `/api/v1/analytics/inventory-alerts/` | Foto actual de artículos activos, existencia <= mínimo, sin existencia y stock negativo heredado |
| `/api/v1/analytics/expenses/` | Gastos por categoría/fecha local, sin incluir compras nuevamente |
| `/api/v1/analytics/month-comparison/?month=2026-10` | Mes completo anterior; mes actual hasta hoy incluido vs mismos días del previo, limitado a su duración |
| `/api/v1/analytics/clients/retention/` | Cantidades de cumpleaños próximos e inactividad de clientas validadas, sin mensajería |
| `/api/v1/reports/export.xlsx?report=overview&desde=2026-10-01&hasta=2026-11-01` | XLSX privado, autorizado y auditado |

Las series devuelven para cada fila `inicio_periodo` (inicio natural lunes/día1), `desde/hasta` realmente incluidos y `etiqueta`. Los extremos de semanas/meses parciales no incluyen registros fuera del rango. Comparación mensual rechaza meses futuros, marca `parcial_mismo_dia` e `incluye_dia_actual`. Variación = (actual−anterior)/abs(anterior)×100; base cero devuelve null, no infinito ni porcentaje inventado.

## Fórmulas y calidad financiera

Matriz detallada en [financial-rules.md](../apps/reporting/references/financial-rules.md). Fuentes por fecha y estado:

- Ventas confirmadas: SUM cabeceras `ventas.total`, una vez por venta, según `confirmada_en`. Incluye propina. Borradores/anuladas excluidos.
- Ingreso operativo: netos de líneas con HALF_UP 2 y descuento global repartido exactamente según Fase 5; servicios/productos separados, sin propina. Se compara subtotal/total recalculado con cabecera. Si no cuadran, ingresos derivados y márgenes quedan nulos con aviso; no se ocultan como ceros.
- Cobros registrados: SUM `pagos.monto` CONFIRMADO de venta CONFIRMADA según `pagado_en`; puede no coincidir con ventas del rango por pagos parciales o de otras fechas. Pagos anulados excluidos; no se interpreta anulación como reembolso.
- Anticipos recibidos: SUM CONFIRMADO por `pagado_en`, excluyendo cita cancelada/expirada/no asistida. Se advierte cuando se excluye dinero de una cita terminal: eso **no demuestra** que se devolvió. REEMBOLSADO/ANULADO no se suman como confirmado.
- Dinero recaudado neto: null y `recaudacion_conciliada=false` en esta versión. Componentes separados no son autorización para sumarlos y llamarlos caja neta. Aplicación de anticipo nunca genera otro cobro.
- Saldo: ventas confirmadas en rango menos cobertura **actual** (pagos confirmados de cualquier fecha y aplicaciones nuevas verificadas). No es deuda al cierre histórico. Se validan origen confirmado, monto aplicado total entre todas las ventas, clienta/cita/visita y sobrecobertura. Vínculo antiguo `anticipos_cita.venta_id` sin ledger fraccionado bloquea saldo, incluso si Fase 5 lo mostraba por compatibilidad; no se considera asignación verificada para reporting.
- Costos: producto y consumo real por snapshots históricos; se exige movimiento correspondiente, artículo, cantidad y costo coincidentes. Servicio sin insumos solo tiene costo cero verificable cuando la confirmación auditada de Fase 5 prueba revisión explícita. Legado sin evidencia de consumo real bloquea costo/margen/utilidad. Costo desconocido no equivale a gratuito.
- Margen contribución: ingreso sin propina−costo directo, **antes** de comisiones. `margen_tras_comisiones` resta comisiones una vez. `utilidad_estimada` resta además gastos por fecha local, sin restar compras de stock otra vez. No incluye impuestos adicionales, depreciación ni costos no registrados. Comisiones por servicio aplican el porcentaje_snapshot al ingreso después de descuento global.
- Ticket: total de ventas confirmadas / número de ventas, incluyendo propina; cero sin ventas. Visitas y clientas únicas se cuentan por finalización, sin multiplicarlas por líneas/pagos; citas terminales y visitas canceladas excluidas.

Se suman costos exactos de snapshots (cantidad3 × costo4), se redondea el agregado monetario al presentar. Margen usa costo exacto antes de cuantizar. Por ello pueden existir diferencias de centavos al sumar cifras individuales previamente redondeadas; no se fuerza conciliación alterando historia. Descuento global se reparte por mayores restos en centavos y desempate por ID de línea, igual a Fase 5.

Indicadores de clientas actuales: cumpleaños en ventana [hoy,hoy+30d), Feb29 pasa a Feb28 en año no bisiesto; inactividad = ninguna visita finalizada en últimos 90 días, incluye nunca atendidas. Solo fichas activas, excluyendo altas QR provisionales aún no validadas. No son índices de retención causal ni cohortes comerciales certificadas. Inventario es existencia actual, no valorización histórica o existencias por lote; negativo heredado se muestra como problema de conciliación, no se corrige escribiendo datos.

## Excel seguro

`report` permitido: overview, revenue-series, payment-methods, top-services, top-clients, inventory-alerts, expenses. Mismos filtros del reporte; no page/page_size. Rankings conservan limit/orden. Nombre legible `Lasheo - Reporte general - 2026-11-01 al 2026-11-20.xlsx`; la última fecha del nombre es inclusiva, aunque la API conserva su límite final exclusivo. Los nombres de reportes y fechas se validan y nunca se concatenan nombres libres al archivo.

El archivo general contiene `Resumen`, `Ingresos`, `Egresos`, `Tratamientos` y `Medios de pago`. Añade `Visitas` solamente con permiso `reporting.view_clients`: todas las visitas iniciadas en el período, abiertas o finalizadas y también las anuladas identificadas por su estado, con nombre, entrada y salida, incluso sin venta o pago. Las visitas no se limitan por el límite de un ranking. Los demás tipos exportan el detalle seleccionado y, con el mismo permiso, la hoja de visitas. No se exportan teléfonos, notas personales, referencias bancarias ni el bloque de metadatos técnicos.

Las cabeceras y explicaciones son nombres de negocio sin guiones bajos. `Ingresos` separa ventas, cobros y anticipos para evitar sumarlos dos veces. `Egresos` distingue gastos operativos y reembolsos; no presupone que las compras de inventario estén pagadas. `Tratamientos` separa reservas recibidas, por fecha de creación, citas programadas o atendidas, por fecha de atención prevista, y tratamientos vendidos, por fecha de venta. Una reserva realizada dentro del período para una visita futura sí figura en las reservas recibidas. Los datos de usuarios se conservan literalmente, incluso si contienen signos especiales.

Clientas/gastos/inventario no arrastran indicadores financieros ajenos al permiso de consulta. Formato monetario S/, cantidades con tres decimales, fechas locales, cabeceras legibles en la cuarta fila, autofiltros y panel congelado en `A5`. Valores monetarios se escriben desde Decimal como celdas numéricas reales; Excel usa su representación numérica propia, por lo que la API sigue siendo la fuente decimal autoritativa. Las advertencias de calidad se traducen a aclaraciones legibles y los importes no verificables permanecen vacíos. El límite de 10 000 filas se aplica al conjunto de hojas; se rechaza el archivo completo si se supera, sin truncar visitas silenciosamente.

Todas las cadenas se escriben explícitamente como texto (`data_type='s'`, quotePrefix); no se permite que `=`, `+`, `-`, `@`, espacios, tabs o saltos iniciales se conviertan en fórmulas. Se limpian caracteres ilegales XML y normalizan CR a LF; no se generan fórmulas, enlaces externos ni hyperlinks. Nunca exportar notas o teléfonos. Celdas bloqueadas quedan vacías y explicadas, no en cero.

Límites: máximo 5000 ventas, 50000 líneas/consumos/fuentes por cohorte; hasta 5000 grupos de inventario/gasto, 10000 filas y 10 MiB por archivo. Si se excede se devuelve 422 sin totales truncados. openpyxl/BytesIO con rangos acotados; no tareas sin límite en memoria. Máximo 5 exportaciones exitosas/minuto/cuenta, bajo advisory lock; 429 al exceder. Se audita usuario, reporte, filtros, orden/top y filas, nunca nombres o teléfono. Si generación o auditoría falla, no se entrega un archivo sin trazabilidad. No se almacena el XLSX en disco del servidor.

## Errores

400 filtros inválidos/no admitidos; 403 sesión/permiso; 404 página inexistente; 405 método no soportado; 422 volumen o tiempo de SQL excedido; 429 exportaciones por cuenta; 503 permisos pendientes de activar o transacción incompatible. Errores de dominio `{code,detail}`, validaciones DRF por campo. No reintentar automáticamente exportación indefinidamente: un reintento cuenta como otro acceso exitoso auditado, aunque no tenga efectos financieros.

## Verificación y activación

Resultados en [test-checklist.md](../apps/reporting/references/test-checklist.md). Contrato [OpenAPI 1.5.0](openapi.json), regeneración `python scripts/update_reporting_openapi.py`, ejemplos [api-examples.json](../apps/reporting/examples/api-examples.json).

El modelo proxy `ReportAccess` no crea tablas. La migración `reporting.0001_report_permissions` solo registra estado de Django y cuatro permisos/content type; [SQL no-op](migrations/phase6-permissions.sql) y [ADR](../apps/reporting/references/schema-map.md). Se aplicó en Lasheo después de revisión y autorización; no es necesario repetirla para iniciar. `python scripts/phase6_activation.py` es revisión sin cambios; `--apply --database-name Lasheo` requiere autorización en cada entorno. `phase6_snapshot.py` comprobó que esquema y filas de negocio coincidían con el baseline tras activar: únicamente metadata de auth/migraciones creció. `phase6_verify.py` verifica consultas de solo lectura, sin generar exportaciones ni auditorías en la base real. El baseline conserva la foto previa; después de operar ventas o exportar legítimamente no debe esperarse que las filas sigan idénticas a esa foto antigua.

No se modificaron las vistas financieras; su semántica se auditó. No se propusieron índices nuevos sin evidencia de lentitud. No hay caché de datos personales, Redis/Celery ni vistas materializadas. Las limitaciones de recaudación/reembolsos siguen abiertas aunque los otros reportes y tests estén aprobados.
