# Entrega de Fase 4: QR, atención, ventas y pagos

Ver también la [verificación posterior de código e instancia local](verificacion-fase-4.md): se detectó que localhost:8443 aún no expone el nuevo endpoint financiero y se corrigieron estados de consulta de inventario y recuperación visual de la venta.

Fecha: 11 de noviembre de 2026. Skill aplicada: `beauty-manager-frontend-fase-4`, suministrada en `SKILL fase 4.md`. Sus referencias auxiliares no estaban adjuntas; los contratos se auditaron directamente en código, OpenAPI y pruebas del repositorio.

## Resultado y decisión de entrega

Se implementó el flujo Angular conectado con Django: solicitud pública, verificación presencial, visita, tratamientos/productos, revisión de consumo real, confirmación, pagos parciales, aplicación de anticipos existentes y consulta de saldo. Se mantienen las capas `domain`, `infrastructure`, `application` y `presentation`, componentes standalone, Signals, RxJS y formularios reactivos.

**GO funcional en entorno aislado; NO-GO para operación comercial con datos reales.** No quedan errores críticos conocidos de seguridad, integridad financiera o inventario en las pruebas ejecutadas. La operación con personas reales requiere aviso de privacidad aprobado/versionado, URL HTTPS pública del frontend y configuración de dominio/proxy verificada. No se reemplazaron los entornos privados ni se publicaron datos reales.

## Pantallas y rutas

| Ruta                       | Pantalla / comportamiento                                                                                                                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/registro/:token`         | `PublicCheckin`: sin cuenta, teléfono, propuesta opcional de ficha, consentimiento no preseleccionado y enlace seguro al aviso. Estados recibido, error, enlace revocado y rate limit con espera. Resultado genérico sin identidad ni consulta pública de teléfonos. |
| `/registro`                | Ayuda para solicitar el enlace QR vigente; no intenta registrar sin token.                                                                                                                                                                                           |
| `/admin/puntos-qr`         | `QrManagement`: listado paginado, crear, revocar/reactivar, QR SVG real y cartel imprimible con URL visible. Bloquea impresión cuando el enlace sigue apuntando a JSON o no es HTTPS del formulario.                                                                 |
| `/admin/llegadas`          | `ArrivalInbox`: búsqueda privada, filtros por estado/fechas/vigencia, paginación y recarga manual.                                                                                                                                                                   |
| `/admin/llegadas/:id`      | `ArrivalDetailPage`: ficha mínima, revisión explícita de identidad/consentimiento, confirmar/rechazar/cancelar, visita única, asociación de visita y enlace de cita compatible existente.                                                                            |
| `/admin/visitas`           | `VisitsList`: filtro por estado/fechas, paginación y apertura manual autorizada.                                                                                                                                                                                     |
| `/admin/visitas/nueva`     | `VisitCreate`: selección privada de ficha activa, verificación presencial y notas. Apertura con clave idempotente.                                                                                                                                                   |
| `/admin/visitas/:id`       | `VisitDetail`: notas, estado, llegada, venta e historial; edición de notas y cancelación permitida por Django. Confirmar la venta finaliza la visita atómicamente.                                                                                                   |
| `/admin/ventas`            | `SalesList`: ventas y totales oficiales, filtros, paginación y acceso a mostrador.                                                                                                                                                                                   |
| `/admin/ventas/nueva`      | `SaleEditor`: borrador de mostrador, o de atención mediante `?visita=<id>`; catálogo real, productos/tratamientos, cantidades, profesionales, descuentos, propina y precio excepcional con permiso/motivo.                                                           |
| `/admin/ventas/:id/editar` | `SaleEditor`: conserva IDs, snapshots y descuentos de líneas; obtiene unidad base real de artículos. Solo borradores.                                                                                                                                                |
| `/admin/ventas/:id`        | `SaleDetailPage`: resumen oficial, revisión de consumos y stock, confirmación, pagos e historial, anticipos aplicables, saldo y correcciones autorizadas.                                                                                                            |

Las rutas están protegidas por sesión y permisos; cada acción tiene autorización adicional en Django. La navegación dejó de presentar visitas como módulo en preparación.

## Componentes y servicios

Componentes reutilizables nuevos: `FinanceNav`, `FinanceFeedback`, `ClientPicker`, `CatalogPicker`, `ConsumptionReview` y `PaymentForm`. Se reutilizan layouts, alertas, validación, carga, paginación, tarjetas de existencias y diálogos de confirmación de fases anteriores.

| Capa                   | Implementación                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dominio                | `checkin.ts`, `visit.ts`, `sale.ts`: estados, DTO, dinero/cantidades como strings, pagos, consumos, saldos y anticipos. Sin fórmulas financieras autoritativas. |
| Infraestructura        | `CheckinApi`, `VisitsApi`, `FinanceApi`; reutilización de `ResourceApi`, `CatalogApi`, `ClientasApi` e `InventoryApi`.                                          |
| Aplicación             | `CheckinFacade`, `QrFacade`, `ArrivalsFacade`, `VisitsFacade`, `LookupsFacade`, `SaleEditorFacade`, `SalesFacade` y `FinancialIntent`.                          |
| Presentación           | Páginas, componentes y validadores de formularios; CSS responsive para móvil, tablet, escritorio e impresión.                                                   |
| Backend complementario | `IntentViewSet` y pruebas: consulta privada del resultado de una operación del propio usuario; no requiere migraciones.                                         |

La matriz completa de endpoints, cuerpos, permisos y dependencias está en [phase4-api-inventory.md](phase4-api-inventory.md). OpenAPI se actualizó a **8.4.2** con `Backend/scripts/update_frontend_phase4_openapi.py`.

## Integridad y privacidad

- Angular presenta subtotal, descuentos, total, costo directo, pagos, anticipos y saldo devueltos por Django. No calcula ni modifica existencias oficiales; vuelve a consultarlas tras confirmar.
- Las líneas de servicios requieren revisión de sus consumos reales, incluso cuando son vacíos. Cargar la receta es una decisión explícita; no la transforma automáticamente en consumo registrado.
- La confirmación requiere diálogo contextual y verificación explícita. Django revalida estado, cantidades, stock agregado y disponibilidad; registra consumos y salidas en una transacción y finaliza la visita.
- Cada mutación financiera conserva su UUID por actor/operación/destino. Solo las UUID persisten en `sessionStorage`; cuerpos, teléfonos, nombres, notas, montos y referencias no se guardan en almacenamiento web.
- Ante timeout, red caída o respuesta incierta, se bloquea otra intención y se ofrece consultar resultado o reintentar el mismo cuerpo/clave. No hay reintentos automáticos de POST financieros.
- Después de recargar se detecta la UUID pendiente. Primero se consulta el endpoint real de recuperación. Si todavía no hay resultado, se conserva la clave para reingresar la misma intención; no se crea otra UUID para reemplazarla.
- Los replays devuelven el resultado original. Las pantallas vuelven a consultar el estado/saldo actual, evitando mostrar un saldo histórico como vigente.
- Los anticipos aplicados se muestran separados de pagos nuevos. La anulación de un pago por error conserva historial y reabre saldo; nunca afirma devolver dinero ni stock.
- Los tokens QR identifican puntos autorizados y no contienen datos personales. El check-in no prueba identidad/presencia física. Solo recepción puede confirmar y activar una propuesta válida con aviso vigente.
- Cookies y CSRF privados se mantienen. El endpoint público usa el contrato anónimo de Django y no provoca cierre de una sesión administrativa por un error del formulario público.
- Las notas se interpolan como texto; no se usan HTML dinámico, almacenamiento de PII, service worker para respuestas privadas, WhatsApp, microservicios ni simulaciones como implementación final.

## Pruebas ejecutadas

Baseline antes de implementar: **51 frontend y 368 Django**, aprobadas.

| Comando / comprobación                       | Resultado                                                                                                                                                                                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                          | Aprobado.                                                                                                                                                                                                                                |
| `npm run lint`                               | Aprobado: 149 archivos de código/plantillas.                                                                                                                                                                                             |
| `npm test`                                   | **93 pruebas aprobadas, 21 archivos**; 42 nuevas respecto del baseline.                                                                                                                                                                  |
| `npm run build`                              | Aprobado; carga inicial aproximada 323 kB, debajo del presupuesto configurado.                                                                                                                                                           |
| `python manage.py test --noinput`            | **373 pruebas aprobadas**; incluye 5 nuevas de recuperación, integraciones PostgreSQL y concurrencia de los módulos existentes.                                                                                                          |
| `npm run e2e`                                | Verificado de nuevo: **57/57 aprobadas** en la suite completa. Tras las correcciones de consulta de stock y saldo, **12/12 aprobadas** con `npm run e2e -- phase4.spec.ts`. Ver [informe de la instancia local](verificacion-fase-4.md). |
| `npm run format:check` y escaneo de secretos | Aprobados. Sin hallazgos de secretos de alta confianza; los secretos locales ignorados permanecen fuera del repositorio.                                                                                                                 |

Después del refuerzo final de aislamiento al cambiar de cuenta, se repitió `npm run e2e -- phase4.spec.ts --grep "pago con respuesta perdida"`: **1/1 aprobada**, con Django/PostgreSQL reales. El arnés confirmó la eliminación de sus bases temporales.

Las pruebas unitarias cubren formularios, decimales exactos, consumos vacíos explícitos, estados públicos, Retry-After, mappers que conservan IDs/snapshots y recuperación de intenciones. Las pruebas HTTP usan `HttpTestingController`: cookies, XSRF, cuerpos string, 400/401/403/404/409/422/429/5xx, propagación de errores sin reenvío automático y separación de sesión pública/privada.

El arnés E2E arranca **Angular compilado + Django real + PostgreSQL temporal** bajo HTTPS. Los controles de prueba y sus credenciales existen solo en el arnés; no se añaden a las rutas normales de la aplicación. Se usan datos sintéticos, sin escrituras ni migraciones en la base Lasheo. La base temporal se elimina al finalizar.

Cobertura E2E nueva: recuperación de caída al cargar el formulario; alta QR completa y pagos; ficha recurrente; QR inválido/revocado; respuesta genérica para desconocidos; duplicados; confirmaciones simultáneas; CSRF y permisos; expiración; pérdida de respuesta de un pago ya persistido y recuperación después de recarga; stock insuficiente; sobrepago; anticipo duplicado; corrección de pago; notas XSS; vistas móvil/tablet y auditoría Axe. Las intercepciones de red se limitan a provocar fallos en pruebas; cuando se pierde una respuesta se ejecuta primero la petición real a Django, no se suplanta su resultado.

Durante la regresión se corrigieron la expectativa antigua de bienvenida de la página provisional, el resolutor de parámetros UUID del contrato OpenAPI y los nombres accesibles de los logotipos público/administrativo. Se añadió también protección probada para que una respuesta de recuperación tardía no entregue resultados del usuario anterior ni borre el intento pendiente de otra cuenta. Los controles de seguridad, saldo y stock no se relajaron.

## Pendientes y límites de operación

1. **Producción con datos reales: NO-GO** hasta configurar/verificar aviso comercial, versión, HTTPS y dominio del formulario público accesible desde un celular. Las plantillas apuntan a `/registro/`; los entornos privados anteriores se conservaron y pueden seguir apuntando a JSON hasta su actualización operativa.
2. La creación completa de agenda y nuevos anticipos de reservas no forma parte de Fase 4. Se utilizan citas compatibles y anticipos confirmados existentes mediante APIs reales.
3. Una devolución integral de venta confirmada con compensación de inventario necesita su flujo administrativo específico. Esta fase bloquea la anulación simple; las APIs de reembolsos/ajustes que ya existen en Django no se simulan ni se presentan como compensación completa.
4. Chromium fue el navegador utilizado; no se afirma validación en Safari, Firefox o dispositivos físicos. El QR local HTTPS del arnés acredita la integración, no la accesibilidad pública de una instalación comercial.
5. Desplegar frontend y backend de esta entrega juntos: el nuevo endpoint de recuperación es necesario para resolver respuestas financieras inciertas. No activar solo el frontend sobre una imagen antigua de Django.

El flujo solicitado queda implementado y técnicamente validado en aislamiento. No se declara la fase comercialmente completada con los requisitos de privacidad/despliegue pendientes. No se requieren cambios de tablas para esta entrega y no se modificaron datos de la base Lasheo.
