# Entrega técnica — Frontend Fase 5

Fecha: 11 de noviembre de 2026. Skill utilizada: `beauty-manager-frontend-fase-5`, suministrada como `SKILL fase 5.md`. Las referencias auxiliares de la skill no estaban adjuntas; se contrastaron contratos con el código, OpenAPI y pruebas del repositorio.

## Objetivo y resultado

Se amplió el módulo de dashboard existente y se reemplazó la página provisional de reportes por una interfaz conectada a Django. La [auditoría de APIs, permisos y criterios financieros](phase5-api-inventory.md) detalla fuentes, filtros, límites y discrepancias encontradas en documentación antigua.

La implementación utiliza componentes standalone, Signals, RxJS y HttpClient. Las reglas, cálculos, permisos, conciliaciones y generación XLSX siguen en Django. No se añadieron dependencias, WhatsApp, microservicios ni simulaciones a la implementación final.

**GO técnico: implementación de Fase 5 validada.** Se aprobaron los 18 E2E específicos y la regresión completa de 76 casos de las fases 1–5, además de 122 pruebas frontend y 373 Django. No quedan pruebas obligatorias pendientes ni fallos críticos conocidos de seguridad o integridad financiera en estos controles. Esto no constituye publicación ni validación comercial de una instancia en ejecución.

## Pantallas y componentes

| Pantalla             | Funcionalidad                                                                                                                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin`             | Conserva saludo y accesos existentes. Con `reporting.view_summary` muestra dashboard financiero: ventas, pagos, anticipos, caja conciliada, saldo actual, costos, comisiones, gastos, utilidad estimada, propinas, ajustes, ticket, visitas y clientas únicas. Sin ese permiso no solicita ni presenta indicadores financieros. |
| `/admin/reportes`    | Selector de siete reportes según permisos; filtros comunes; tablas, gráfica, ranking, paginación y descarga Excel. Puede abrirse con permiso exclusivo de clientas o inventario sin conceder resumen general.                                                                                                                   |
| Dashboard: evolución | Gráfica SVG de todos los períodos con tabla completa accesible y desplazamiento por teclado. Ventas, cobros y anticipos tienen etiquetas y estilos propios.                                                                                                                                                                     |
| Dashboard: detalle   | Medios de pago separados, tratamientos/clientas destacados, inventario actual, gastos por categoría y comparación mensual oficial.                                                                                                                                                                                              |

Componentes nuevos: `DashboardAnalytics`, `ReportsPage`, `ReportFilters`, `ReportPanel`, `ReportQuality`, `KpiGrid`, `FinancialTrend`, `PaymentMethods`, `ReportTable` y `MonthComparison`. Se reutilizan layouts, tokens, alertas, carga, botones y paginación existentes.

Los filtros ofrecen día, semana, últimos siete días, mes actual hasta hoy, mes anterior y rango personalizado, con agrupación diaria/semanal/mensual. Se muestra siempre el período aplicado, la fecha exclusiva que confirma el servidor y la hora de generación en Lima. Datos vacíos y métricas no verificables son estados distintos.

## Archivos de esta fase

Se preservaron los cambios locales anteriores de Fase 4; esta lista describe las incorporaciones y modificaciones propias de Fase 5.

| Ruta                                                                                              | Cambio                                                                                                             |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/app/features/dashboard/domain/{analytics,periods}.ts`                                        | DTO, catálogo de KPIs, permisos por reporte, formato decimal exacto y rangos locales.                              |
| `src/app/features/dashboard/infrastructure/{analytics-api,analytics-adapters,report-download}.ts` | Adaptadores HTTP reales, validación de contratos/flags y descarga binaria segura.                                  |
| `src/app/features/dashboard/application/{report-resource,dashboard-facade,reports-facade}.ts`     | Lecturas cancelables, errores parciales, estado Signals, filtros y coordinación de reportes/Excel.                 |
| `src/app/features/dashboard/presentation/`                                                        | Componentes, páginas y plantillas descritos arriba.                                                                |
| `src/app/features/dashboard/dashboard-page.{ts,html}`                                             | Integra el dashboard financiero en el módulo existente, sin duplicarlo.                                            |
| `src/app/features/dashboard/reporting-guard.ts`                                                   | Guard de reportes con permisos alternativos de lectura.                                                            |
| `src/app/app.routes.ts`, `core/config/navigation.ts`                                              | Ruta real de reportes y navegación según permisos.                                                                 |
| `src/app/core/http/api-interceptor.ts`                                                            | Decodificación acotada de errores JSON entregados como Blob.                                                       |
| `src/styles/analytics.scss`, `src/styles.scss`                                                    | Rejillas responsive, KPIs, tablas y gráfica desplazables/accesibles.                                               |
| `src/app/features/dashboard/**/*.spec.ts`, `tests/fixtures.ts`                                    | Pruebas unitarias, HTTP, facades, adaptadores, componentes y descarga. Fixtures utilizados únicamente por pruebas. |
| `e2e/phase5.spec.ts`, `e2e/helpers.ts`                                                            | Casos reales de navegador y roles sintéticos con permisos separados.                                               |
| `Backend/scripts/frontend_analytics_fixture.py`, `frontend_e2e_server.py`                         | Preparación y controles del arnés temporal; no modifica APIs ni esquema de negocio.                                |
| `README.md`, `docs/phase5-api-inventory.md`, este informe                                         | Documentación de ejecución, contratos, resultados y límites.                                                       |

## Seguridad, integridad y UX

- Los permisos se comprueban en la UI y en DRF. Resumen no habilita nombres de clientas, inventario ni Excel; exportar requiere además el permiso del reporte concreto.
- Cambiar filtros cancela las lecturas anteriores y elimina datos viejos antes de presentar el nuevo período. Un fallo de un widget conserva los otros y permite reintentar esa consulta.
- Los componentes respetan null y las banderas de conciliación/habilitación. No calculan caja, saldo, margen, ticket, descuentos o porcentajes financieros.
- El anticipo se distingue de su aplicación; el pago anulado no se interpreta como reembolso; la caja neta requiere evidencia de cierres y puede no estar disponible.
- Exportar recibe el mismo rango aplicado, orden y top; únicamente elimina la paginación. Se bloquean cambios de selección mientras se descarga para evitar confusión de períodos.
- No se guardan reportes, importes o datos personales en localStorage, sessionStorage, IndexedDB o cachés PWA. No hay analítica externa ni logs de reportes.
- El gráfico usa geometría de presentación; sus etiquetas y tablas conservan los decimales recibidos. Tablas y regiones con scroll son navegables con teclado. Axe verificó ausencia de incidencias graves/críticas en móvil, tablet y escritorio.
- Cada endpoint ofrece su snapshot/hora de generación; el dashboard no promete que varias peticiones independientes correspondan a una única transacción. Una exportación posterior tiene su propio corte visible.

## Pruebas y evidencia

Baseline: **93 pruebas frontend y 373 Django**, aprobadas antes del desarrollo.

| Comando / control                                | Resultado                                                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                              | Aprobado.                                                                                                                             |
| `npm run lint`                                   | Aprobado: 177 archivos de código/plantillas.                                                                                          |
| `npm test`                                       | **122/122 aprobadas**, 27 archivos; 29 pruebas nuevas frente al baseline. Se repitieron tras finalizar todos los cambios de interfaz. |
| `npm run build`                                  | Aprobado, carga inicial aproximada 328 kB; sin exceder el presupuesto configurado.                                                    |
| `python manage.py test --noinput`                | 373 aprobadas; base PostgreSQL temporal eliminada al terminar.                                                                        |
| `npm run e2e -- phase5.spec.ts --max-failures=1` | **18/18 aprobadas**.                                                                                                                  |
| `npm run e2e -- --max-failures=1`                | **76/76 aprobadas**, fases 1 a 5 completas, en 5.5 minutos.                                                                           |
| Formato, diff y secretos                         | Aprobados: 222 archivos de formato y diff sin errores; escaneo de secretos de alta confianza sin hallazgos.                           |

Las pruebas de Fase 5 utilizan Angular compilado, HTTPS, Django y PostgreSQL reales. Se creó exclusivamente una base temporal aleatoria `frontend_e2e_*`; las aserciones del arnés impiden usar la base Lasheo. Las tablas de negocio y sus filas en Lasheo no se modificaron. La preparación del esquema solo ocurre en la base temporal del arnés y no constituye una migración de esta entrega.

Caso financiero sintético verificado: una venta con servicio/producto, descuento global y propina devuelve ventas S/ 95; pago confirmado S/ 20; anticipo S/ 30 recibido en septiembre y aplicado en octubre; pago anulado excluido; reembolso S/ 3 y ajuste comercial S/ 2; costo S/ 5; comisiones S/ 7.20; gastos S/ 7; saldo actual S/ 46; utilidad estimada S/ 68.80; caja neta S/ 17 con cierres vigentes para los 31 días y seis medios de octubre. Se comprobó también caja null sin cierres y rango sin ventas sin inventar cifras.

Los siete Excel se inspeccionaron con openpyxl: filtros, zona, hojas y tipo de celdas; ausencia de fórmulas, enlaces externos y teléfonos. Nombres que comienzan por `=` y `@` permanecen como texto literal. La prueba de límite real produjo 429 sin descargar un archivo falso; una sesión caducada al exportar volvió al login.

Cobertura adicional: rangos inválidos y límites, mes anterior/bisiesto, cambio de día UTC/Lima, precisión decimal grande y negativa, cancelación de consulta obsoleta, errores 400/403/422/429/500 y timeout, error parcial de red, bloqueo de descarga tardía al abandonar la página y revocación de objectURL. Los fallos de red se provocan solo en pruebas; no sustituyen los resultados positivos de Django.

Evidencia local ignorada por Git: `.artifacts/e2e-phase5-results.json`, capturas `phase5-dashboard-desktop.png` y `phase5-reports-{390,820}.png`, y los XLSX sintéticos bajo `test-results/`. La regresión posterior puede reemplazar esos archivos; no contienen datos reales.

## Pendientes y decisión GO/NO-GO

- No quedan dependencias de API para los requisitos obligatorios implementados. La evolución temporal de utilidad, los filtros específicos de cohortes/categorías y los trabajos asíncronos son extensiones no declaradas como implementadas; sus límites/contrato propuesto figuran en la auditoría.
- No se implementaron agenda, PWA o despliegue comercial. La interfaz no genera conciliaciones ni modifica reembolsos, pagos o inventario.
- El permiso de resumen se mantiene independiente de los demás; un operador local sin el permiso no verá cifras. La asignación de permisos existentes es una decisión operativa, no una razón para eludir DRF.
- Los cambios siguen locales; no se actualizaron servicios en ejecución ni se subieron commits. La verificación anterior detectó una versión antigua del endpoint de Fase 4 en localhost:8443; deben desplegarse frontend/backend compatibles antes de habilitar los cambios allí.
- **GO técnico de la Fase 5 implementada y probada.** No quedan inconsistencias financieras ni fallos críticos conocidos en las pruebas ejecutadas. **NO-GO para afirmar publicación o validación comercial**, que no se han ejecutado; los límites operativos y extensiones no implementadas están detallados arriba.
