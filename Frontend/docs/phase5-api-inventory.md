# Fase 5: auditoría de analítica y reportes

Auditoría del 11 de noviembre de 2026. Se contrastaron rutas, serializadores, permisos, servicios, exportador, OpenAPI y pruebas. Las rutas de la skill eran propuestas; la implementación utiliza las rutas reales indicadas aquí.

## Estado comprobado de fases anteriores

- Angular **22.2.5**, TypeScript **6.0.3**, Signals, RxJS, componentes standalone, Angular Material y npm con lockfile existente. No se añadieron dependencias.
- Fase 1: sesiones Django, MFA, permisos efectivos, guards, interceptor XSRF y caducidad.
- Fase 2: fichas de clientas, catálogo privado/público, unidades, recetas e imágenes, mediante APIs reales.
- Fase 3: existencias, movimientos, alertas, proveedores y compras con recepción transaccional.
- Fase 4: registro QR, recepción con identidad presencial, visitas, ventas, consumos, pagos y aplicación de anticipos; el código local incluye recuperación idempotente de cobros. Se conservaron sus cambios existentes sin descartarlos ni recrearlos.
- Dashboard anterior: portada y accesos rápidos, sin métricas. Reportes era una página de preparación.
- Baseline ejecutado antes del desarrollo: **93 pruebas Angular y 373 Django aprobadas**. La regresión de navegador posterior cubre nuevamente las fases anteriores.

La instancia local en ejecución y el código del proyecto son distintos: la verificación de Fase 4 había detectado que localhost:8443 aún no expone su endpoint nuevo de recuperación. Esta entrega no reconstruye ni reinicia esa instancia.

## Contrato real

Los endpoints son privados, de solo lectura salvo la auditoría de exportación. Requieren sesión, usuario activo/staff y permisos específicos; `is_staff` y `finanzas.view_finance` no conceden analítica por sí solos. El frontend conserva las cookies y el manejo de caducidad. Los GET de reportes no son POST financieros ni requieren una clave idempotente.

| Endpoint real                                       | Permiso                                                 | Integración                                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/v1/analytics/overview/`                       | `reporting.view_summary`                                | Indicadores, definiciones, calidad, saldos actuales, utilidad estimada y caja neta condicionada a conciliación.                                      |
| `/api/v1/analytics/revenue-series/`                 | `reporting.view_summary`                                | Ventas, cobros registrados y anticipos separados por día/semana/mes. Gráfica y tabla con todos los períodos.                                         |
| `/api/v1/analytics/payment-methods/`                | `reporting.view_summary`                                | Componentes separados por medio; no suma frontend para llamarlos caja neta.                                                                          |
| `/api/v1/analytics/top-services/`                   | `reporting.view_summary`                                | Cantidad, ingreso después de descuentos, costo, comisión y ventas; ranking y paginación.                                                             |
| `/api/v1/analytics/top-clients/`                    | `reporting.view_clients`                                | Nombre mínimo y ventas/visitas del rango; sin teléfonos, notas o email.                                                                              |
| `/api/v1/analytics/inventory-alerts/`               | `reporting.view_inventory`                              | Foto actual de existencias oficiales y mínimos. Enlace al módulo de inventario únicamente si además permite consultar artículos.                     |
| `/api/v1/analytics/expenses/`                       | `reporting.view_summary`                                | Gastos por categoría y total oficial, sin volver a restar compras de stock.                                                                          |
| `/api/v1/analytics/month-comparison/?month=YYYY-MM` | `reporting.view_summary`                                | Comparación homogénea del mes actual/anterior, porcentajes provenientes de Django y base cero como null. Solo se solicita con los presets mensuales. |
| `/api/v1/reports/export.xlsx`                       | `reporting.export` **y** permiso de lectura del reporte | Descarga binaria real de cualquiera de los siete reportes exportables. Mismos filtros, orden y top; sin paginación.                                  |

Existe también `/api/v1/analytics/clients/retention/`, con `reporting.view_clients`; su alcance es una foto actual, no retención causal. No se presenta como una serie temporal ni se usa para inventar métricas del período.

### Fechas y filtros

La UI ofrece hoy, semana actual de lunes a domingo, últimos siete días, mes actual hasta hoy, mes anterior y rango personalizado. Las fechas visibles son inclusivas y se calculan en **America/Lima**. El adaptador envía `desde` inclusive y `hasta` **exclusiva**, sumando un día de calendario a la fecha final visible. No construye `23:59:59` ni usa el día UTC como día comercial.

Consulta de octubre de 2026:

```text
desde=2026-10-01&hasta=2026-11-01&granularidad=day&timezone=America/Lima
```

El rango máximo admitido es 366 días con agrupación diaria y 3660 con agrupación semanal/mensual. Cada widget y la descarga utiliza el mismo filtro aplicado de su página. La selección no se guarda en almacenamiento web ni incluye PII en URLs.

Rankings: `orden=importe|cantidad` para servicios y `importe|visitas` para clientas, `limit=100` en reportes, `page` y `page_size=20`. El dashboard muestra un top de cinco y las primeras cinco filas de gastos/inventario; el módulo de reportes permite paginar. No se siguen enlaces de paginación absolutos a otros orígenes.

`month-comparison` admite exclusivamente `month`; no se le envían parámetros de período incompatibles. El mes actual compara hasta hoy contra los mismos días del anterior, limitado a su duración. La UI no calcula diferencias o porcentajes.

### Semántica financiera verificada

Los importes se reciben como cadenas decimales y se formatean sin convertirlos a aritmética monetaria flotante. `null` se mantiene como **No disponible**. El uso de `Number` se limita a geometría SVG de la gráfica; las etiquetas y tablas conservan los importes del servidor.

- Ventas confirmadas: por fecha de confirmación, incluida la propina; borradores y anuladas quedan fuera.
- Cobros registrados: pagos confirmados por fecha de recepción; excluye anticipos y pagos anulados. Es un componente bruto, no caja neta.
- Anticipos recibidos: fecha de recepción propia. Aplicar dinero recibido en otro período no crea un ingreso nuevo.
- Saldo pendiente: cobertura **actual** de las ventas del período; no se anuncia como deuda al cierre histórico.
- Costos y comisiones: snapshots históricos y consumos/movimientos verificados. Un costo no verificable no se transforma en cero.
- Utilidad operativa estimada: fórmula y habilitación de Django, separada de la propina, ajustada según gastos y ajustes registrados. No certifica utilidad contable/fiscal.
- Caja neta: se muestra solo si `calidad.recaudacion_conciliada` y `dinero_recaudado_habilitado` son verdaderos. Django exige cierres con evidencia vigentes para cada día/medio, incluidos días sin movimientos. Se muestran entradas y devoluciones conciliadas por separado.

**Corrección de documentación histórica:** `Backend/docs/reporting-api.md` y sus ejemplos antiguos describen un bloqueo permanente por ausencia de ledger de reembolsos. El código actual de `apps/reporting/application/services.py` utiliza `cash_ledger.reconciled_range`, que sí contempla reembolsos y ajustes. No se modificaron esas reglas: el frontend respeta las banderas y advertencias devueltas en cada respuesta. Los E2E comprobaron caja habilitada y caja no disponible.

### Exportación y errores

HttpClient recibe `Blob` y cabeceras completas. Se verifica MIME XLSX, tamaño máximo 10 MiB y firma ZIP; se usa un filename seguro coherente con el reporte y sus fechas, o se deriva uno validado. El archivo no se reconstruye en JavaScript. El objectURL se revoca y el enlace temporal se elimina; abandonar la página impide iniciar una descarga tardía.

El interceptor ahora decodifica respuestas JSON de error recibidas como blob, con límite de 64 KiB, y conserva caducidad de sesión, permisos y mensajes seguros. No se muestran SQL, trazas ni el cuerpo privado en consola. No hay reintentos automáticos de exportación: cada descarga exitosa genera auditoría en Django y está limitada a cinco/minuto/cuenta.

Los siete archivos generados por Django se abrieron con openpyxl en E2E. Se verificaron fechas/moneda/zona, ausencia de fórmulas y enlaces externos, y nombres sintéticos que empiezan por `=` o `@` almacenados como texto literal. No se exportaron teléfonos ni notas.

## Dependencias y límites

No falta una API para los requisitos obligatorios de esta fase. No se añadieron endpoints, modelos, tablas, vistas, migraciones ni fórmulas financieras al backend.

- La evolución diaria/semanal de utilidad y costos no existe en `revenue-series`; no se infiere sumando indicadores en Angular. Si se requiere, el backend debe proporcionar un contrato adicional, por ejemplo **propuesto, no implementado** `/api/v1/analytics/profit-series/`, con períodos locales, ingreso sin propina, costos, comisiones, gastos, ajustes, utilidad nullable y calidad por fila, bajo `reporting.view_summary`. Actualmente se ofrece utilidad del período y comparación mensual oficial.
- Los filtros globales de esta entrega son temporales y su alcance es el establecimiento. No se mezclan cohortes de servicios/profesionales con gastos e inventario que tienen filtros distintos. Los contratos existentes permiten futuras selecciones específicas, pero no se declara su UI implementada.
- No existe una API de trabajos asíncronos de exportación en este contrato; se respetan los límites síncronos reales y no se simula polling.
- No se añadieron actividades recientes ni una retención histórica sin contrato. Agenda, PWA y despliegue final permanecen fuera de alcance.
- El despliegue de los cambios y la revisión operativa/comercial no forman parte de las pruebas aisladas. Los cambios siguen locales.
