# Frontend Fase 3 — inventario, proveedores y compras

Fecha: 11 de noviembre de 2026. **GO funcional local**: integración con Django y PostgreSQL reales, sin migraciones ni operaciones de prueba en la base Lasheo. Esta aceptación no sustituye los pendientes de producción comercial del informe backend Fase 8.

## Auditoría y alcance

Se leyó `C:/Users/Usuario/Downloads/SKILL fase 3.md` (`beauty-manager-frontend-fase-3`) y se contrastó con el repositorio. Los archivos auxiliares frontend mencionados por la skill no fueron suministrados; se usaron los contratos, código y pruebas existentes del backend. Fases frontend 1/2 verificadas: sesión Django, MFA, CSRF, permisos, navegación, clientas y catálogo; no eran simulaciones. Baseline ejecutada: 33 pruebas unitarias/HTTP, lint de 75 archivos y build correctos.

Versiones conservadas: Angular 22.2.5; CLI/build/Material/CDK 22.2.6; TypeScript 6.0.3; RxJS 7.8.2; Tailwind 4.3.5; Node 24.15.0; npm 11.12.1. Backend Django 5.2.19, DRF 3.18.3 y PostgreSQL 18.6. Las fases backend posteriores ya existen: no se vuelven a implementar ventas, agenda o QR. Lasheo tiene actualmente 52 tablas públicas y 7 vistas, incluyendo soporte aditivo de fases anteriores; las 34 tablas originales no se recrean.

## Pantallas y componentes

| Ruta                                                  | Funcionalidad                                                                                                                                                                    |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin/inventario`                                   | Conteos globales de artículos activos, mínimos, agotados y sin movimientos; stock paginado, filtros de texto/tipo/categoría/estado/mínimo; últimos cinco movimientos autorizados |
| `/admin/inventario/articulos/:id`                     | Existencia y unidad reales, SKU, costo histórico orientativo, recetas que usan el artículo e historial paginado                                                                  |
| `/admin/inventario/movimientos`                       | Entradas/salidas firmadas, origen, operador por ID, notas; filtros por artículo, compra, motivo y fechas                                                                         |
| `/admin/inventario/alertas`                           | Reposición de artículos activos con existencia menor o igual al mínimo; enlace a preparar compra                                                                                 |
| `/admin/inventario/ajustes/nuevo`                     | Entrada/salida justificada, confirmación, errores por campo, recuperación de intención y reconsulta de stock                                                                     |
| `/admin/proveedores` y `/nuevo`, `/:id`               | Lista paginada, búsqueda, alta, edición y desactivación/reactivación lógica según permisos                                                                                       |
| `/admin/compras` y `/nueva`                           | Lista por proveedor, documento, estado y fechas; borrador con líneas dinámicas, unidades reales, lotes/vencimiento opcionales y vista previa del importe                         |
| `/admin/compras/:id`, `/:id/editar`, `/:id/recepcion` | Ficha, edición exclusiva de borrador, confirmación de recepción, stock actualizado y anulación sin movimientos                                                                   |

Componentes standalone con OnPush: StockList, ArticleDetail, MovementHistory, StockAlerts, StockAdjustment, StockCards, MovementCards, PurchasesList, PurchaseForm, PurchaseDetail, SuppliersList, SupplierForm y SupplierPicker. Se añadieron OperationsNav y ValidationSummary compartidos; se reutilizaron campos, paginación, selector de referencias, confirmación Material y estados de carga/vacío/error.

Separación: domain define DTO/reglas de presentación; infrastructure adapta HTTP; application coordina operaciones, Signals y RxJS; presentation contiene formularios reactivos y navegación. Ningún componente decide permisos definitivos, existencia disponible, importe definitivo ni recepción de mercadería.

## Integración real y reglas

Inventario completo de endpoints, filtros, DTO y permisos: [contrato Fase 3](phase3-api-inventory.md). Contrato consolidado: [OpenAPI 8.4.0](../../Backend/docs/openapi.json).

- Proveedores: GET/POST `/api/proveedores/`, GET/PATCH `/{id}/`, POST `/{id}/{desactivar,reactivar}/`.
- Compras: GET/POST `/api/compras/`, GET/PATCH `/{id}/`, POST `/{id}/{recibir,anular}/`, GET `/estado-intento/?clave=uuid`.
- Inventario: GET `/api/inventario/stock/`, `/stock/resumen/`, `/stock/usos-receta/?articulo=id`, `/movimientos/`, `/movimientos/{id}/`, `/alertas/?tipo=bajo_stock`; POST `/ajustes/` y GET `/ajustes/estado/?clave=uuid`.
- Catálogo existente: categorías, unidades, artículos y servicios para selectores/fichas; no se duplica su mantenimiento.

Las cuatro consultas auxiliares, metadatos de stock y creación idempotente de compras se añadieron porque el contrato previo no cubría la UI de manera segura. La propuesta se documentó en el inventario de contratos antes de implementar. Se reutilizan auditoría y tablas existentes; no hubo DDL, migraciones ni cambios de permisos.

Recepción completa y ajustes se ejecutan en transacciones atómicas Django/PostgreSQL, con bloqueo de compras/artículos y protección contra stock negativo. Recibir una compra dos veces no agrega movimientos. Una compra vacía, anulada, vencida o incompatible no se recibe. La edición de borrador sustituye líneas atómicamente. El ledger permanece inmutable desde estas pantallas.

La nueva UI siempre envía UUID `Idempotency-Key` al crear compras y ajustes. Django serializa por actor/clave y audita hash/resultado. Repetición válida retorna el recurso existente; cuerpo distinto para clave confirmada produce 409. El encabezado de creación de compras sigue siendo opcional exclusivamente para compatibilidad con clientes anteriores.

Solo el UUID pendiente, separado por usuario, se guarda en sessionStorage. Los cuerpos permanecen en memoria; no se persisten datos personales ni credenciales. Tras una respuesta perdida la UI bloquea modificaciones ambiguas y reutiliza la misma clave. Después de recargar consulta el estado propio en Django; incluso si aún no se encontró el resultado conserva esa clave al reenviar. No muestra éxito sin confirmación del servidor. Los dobles clics y diálogos simultáneos se bloquean.

Cantidades y costos viajan como strings decimales exactos. Django utiliza Decimal y conserva los costos registrados. La vista previa de compra usa enteros BigInt a escala fija, suma líneas y redondea al final; nunca determina el total guardado. La UI conserva `total` oficial y moneda PEN. Las fechas se muestran en America/Lima; un timestamp sin cambios no se trunca al editar.

Cada ruta exige los permisos correspondientes y Django los vuelve a validar. Ajustar exige consultar artículos/movimientos y agregar movimientos. Los usos de recetas requieren además view_servicios. Los últimos movimientos no se entregan a quien solo puede consultar artículos. CSRF sigue obligatorio, incluso con autenticación válida; las denegaciones CSRF se distinguen de falta de permisos sin publicar detalles internos. El manejo local de errores conserva la caducidad global de sesión.

## Pruebas ejecutadas

| Comprobación                                                             | Resultado                                                                                                                                                |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                                           | 106 archivos TypeScript/HTML verificados, sin errores                                                                                                    |
| `npm run typecheck`                                                      | Correcto                                                                                                                                                 |
| `npm test`                                                               | 49 pruebas en 14 archivos, aprobadas                                                                                                                     |
| `npm run build`                                                          | Correcto; inicial 318.53 kB, transferencia estimada 86.34 kB; rutas diferidas, presupuestos cumplidos                                                    |
| `npm audit --audit-level=low`                                            | 0 vulnerabilidades conocidas                                                                                                                             |
| Backend `scripts/frontend_backend_regression.py apps.inventario` inicial | 48 pruebas aprobadas; posteriormente se agregó la prueba CSRF y se incluyó en la regresión completa                                                      |
| Backend `scripts/frontend_backend_regression.py` final                   | 368 pruebas aprobadas en 108.936 s; PostgreSQL aislado, base eliminada                                                                                   |
| `npm run e2e` final                                                      | 45 aprobadas en 2.8 min, 0 fallidas, omitidas o inestables; incluye 31 anteriores y 14 nuevas                                                            |
| Responsive y accesibilidad                                               | Chromium: 360, 390, 768 y 1280 px para inventario, compra, ajuste y proveedor; sin desbordamientos horizontales ni violaciones axe WCAG A/AA comprobadas |
| Rendimiento backend existente                                            | Fixture aislada de 1000 ventas/1000 líneas: 25 consultas, 0.167 s; referencia de regresión, no benchmark de capacidad de inventario                      |
| Despliegue local                                                         | Imagen reconstruida; validación Nginx/readiness correctas; SPA y catálogo 200; APIs privadas 403 sin sesión, con CA local verificada explícitamente      |

Las pruebas HTTP verifican CSRF, encabezado idempotente, cantidades/costos strings y ausencia de importes/saldos calculados por el cliente. Las de componentes validan cantidades/unidades y costo no verificable. Se prueban redondeo exacto, campos anidados de líneas, recuperación tras recarga, aislamiento del almacenamiento por intención y bloqueo de cuerpos ambiguos.

E2E usa Angular compilado y Django real contra una base PostgreSQL nueva `frontend_e2e_*` con cuentas y datos sintéticos exclusivamente allí. Incluye alta/edición/estado/paginación de proveedores; compra/borrador/PATCH/recepción; stock después de confirmar; anulación; compra vacía/vencida; ajustes positivos/negativos; insuficiencia sin saldo negativo; permisos/CSRF; filtros y estados vacíos. Dos operadores autenticados reciben simultáneamente la misma compra y generan una única entrada. Las pruebas Python añaden creación concurrente con una misma clave, junto con las pruebas de concurrencia previas de inventario.

Para comprobar pérdida de respuesta se deja que la petición alcance y confirme en Django y luego se interrumpe su entrega al navegador. El reintento o recarga recupera el registro verdadero, sin simular persistencia ni autenticación. La aceptación de certificados sintéticos se limita al arnés; no demuestra confianza TLS comercial.

Evidencia local: `Frontend/.artifacts/e2e-results.json`, `e2e-backend.log`, capturas `inventario-390.png` e `inventario-1280.png`; `Backend/backups/frontend-phase3-backend-regression.log`, `frontend-phase3-inventory-tests.log`, `frontend-phase3-local-verification.json`. No se publican secretos ni volcados de datos personales. Al cerrar la ejecución E2E se confirmó la eliminación de su base; se comprueba además que no quedan bases temporales de esta fase.

## Problemas corregidos y optimizaciones

- Faltaba una clave idempotente de creación de compra: bloqueo PostgreSQL y auditoría sin tablas nuevas.
- Tras recargar una respuesta perdida se podía perder el contexto: consultas de estado restringidas al actor y conservación exclusiva del UUID.
- Los errores DRF de líneas anidadas no eran legibles: resumen con índice/campo, límites de profundidad/tamaño y texto escapado.
- DRF clasificaba CSRF como permiso denegado: código `csrf` manteniendo HTTP 403 y todas las verificaciones.
- Los avisos globales podían quedar obsoletos tras corregir un formulario: errores de mutación locales, sin suprimir sesión caducada.
- Faltaban SKU, categoría, unidad y recetas inversas: campos/consultas de lectura con permisos. Stock tras recepción usa subconsulta por compra; varias líneas del mismo artículo no duplican la fila.
- Consultas de listas paginadas en servidor y selectores con búsqueda; resumen global separado de la página visible. Relaciones de recetas usan select_related. Movimientos recientes limitados a cinco.
- Se amplió de 10 a 30 segundos la espera máxima de eliminación PostgreSQL al cerrar E2E y se registran inicio/fin del borrado: la ejecución final terminó correctamente y no oculta errores del arnés.
- Navegación móvil con scroll; nuevas rutas diferidas y controles de respuesta obsoleta al cambiar de artículo.

## Límites y aceptación

No hay fallos críticos conocidos ni pruebas obligatorias pendientes para el alcance local. Los artículos actuales pueden mostrar cero existencias y listas vacías: no se cargaron compras, proveedores ni movimientos ficticios en Lasheo. Se verificaron en lectura 52 tablas, 7 vistas y los nueve permisos necesarios del operador existente, sin modificar roles.

Persisten límites explícitos del modelo: no hay saldo actual verificable por lote; las alertas mostradas son de reposición, no falsas alertas de vencimiento de lotes con saldo. Costos orientativos históricos pueden ser null y no equivalen a valoración contable o FIFO. No hay devolución a proveedor. El número de documento no es único por esquema: dos intenciones independientes no se deduplican globalmente; revisar documentos e historial. Cerrar la pestaña o borrar su almacenamiento elimina la ayuda de recuperación del UUID, por lo que debe comprobarse el historial antes de crear otra intención. No se afirma soporte probado en otros navegadores ni CI Linux.

La CA local sigue sin instalarse como confiable en Windows por la decisión anterior del usuario; no se fuerza su instalación. No se expone el servicio fuera de loopback ni se cambia la decisión comercial NO-GO documentada en backend.

Criterios aceptados: todas las pantallas consumen APIs reales; operaciones administrativas con permiso y CSRF; precios/cantidades exactos; recepción/ajustes sin duplicar ni negativizar stock; concurrencia y recuperación probadas; filtros/paginación/carga/error/vacío; responsive y accesibilidad verificados; fases 1/2 sin regresiones; tablas y vistas existentes reutilizadas. No se añadieron interfaces de QR, visitas, ventas, dashboard financiero, WhatsApp o microservicios.

## Archivos y reversión

Lista completa de entrega: [phase3-files.json](phase3-files.json). No existe repositorio Git inicializado en esta carpeta; la lista distingue archivos nuevos/adaptados según la inspección de esta intervención, no representa un diff Git.

Para revertir la UI, restaurar el build frontend anterior y sus rutas/navegación; para retirar las adaptaciones API, restaurar las versiones anteriores de los archivos listados y reconstruir la imagen local. No borrar compras, movimientos ni auditoría creados por usuarios y no restaurar un respaldo encima de Lasheo para deshacer cambios de presentación. Los nuevos endpoints son aditivos; el contrato anterior de compras sigue aceptado. No hay migración inversa ni cambio de esquema. El ajuste de clasificación CSRF puede revertirse independientemente sin desactivar CSRF. El cambio del arnés solo afecta a las pruebas aisladas.
