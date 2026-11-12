# Informe técnico: frontend Fase 6

Fecha: 12 de noviembre de 2026. **Estado: implementación entregada para revisión; cierre bloqueado por autorización de comisiones en Django.** No se declara completa ni lista para producción.

## Auditoría de las fases anteriores

Se inspeccionaron implementaciones reales, rutas, servicios HttpClient, control de sesión/MFA, CSRF, permisos, contratos Django, esquema legado y pruebas existentes. El estado inicial incluye cambios locales de las fases 4 y 5 aún sin commit; se conservaron. No se asumió que una skill acreditara una funcionalidad.

| Fase                    | Implementación encontrada                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1                       | Angular standalone, sesión Django, MFA, guards, permisos, shell responsive, interceptor HTTP/CSRF                    |
| 2                       | Clientas, formularios reactivos, búsqueda y paginación reales, privacidad de notas                                   |
| 3                       | Catálogo, recetas, imágenes, existencias, proveedores, compras y recepción real                                      |
| 4                       | Registro QR público, confirmación de identidad, llegadas, visitas, ventas, consumos, pagos y aplicación de anticipos |
| 5                       | Dashboard y reportes de Django, filtros, rankings, alertas y exportación Excel                                       |
| 6 antes de esta entrega | Backend privado de agenda implementado y probado; ruta Angular de agenda era un placeholder                          |

La línea base frontend tenía 122 pruebas unitarias/HTTP/componentes y 76 E2E. Se ejecutó además la regresión Django completa: 373 pruebas correctas en PostgreSQL temporal, sin tocar tablas de producción.

## Pantallas y componentes

| Ruta                             | Componentes y comportamiento                                                                                                                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin/agenda`                  | `CalendarPage`: vistas diaria, semanal y mensual; fechas/profesional/servicio/estado; horarios y bloqueos reales; navegación anterior/hoy/siguiente; acción de expiración en Django                                   |
| `/admin/agenda/citas/nueva`      | `BookingPage`, `ClientPicker` reutilizado, `ServicePicker`, `SlotPicker`: clienta activa, uno a diez servicios distintos, profesional elegible para todos, fecha y hueco del servidor, revisión de importes y reserva |
| `/admin/agenda/citas/:id`        | `AppointmentPage`: snapshots, historial, notas, estados y acciones; confirmación, reprogramación, cancelación, inasistencia, completar y enlace de llegada                                                            |
| Misma ficha de cita              | `AdvancesPanel`: requerido/confirmado/pendiente oficiales; registro pendiente, confirmación manual, anulación de pendiente; expiración según estado de cita de Django                                                 |
| `/admin/agenda/profesionales`    | `ProfessionalsPage`: alta/edición/desactivación, especialidades, asociación de usuario autorizada, horarios, edición y retiro con confirmación/motivo                                                                 |
| `/admin/agenda/bloqueos`         | `BlocksPage`: rangos, alta/edición/retiro, profesional o global, motivos y excepción histórica autorizada                                                                                                             |
| `/admin/agenda/lista-espera`     | `WaitlistPage`: búsqueda por fechas/estado/profesional/servicio y alta real de solicitud                                                                                                                              |
| `/admin/agenda/lista-espera/:id` | Oferta manual sin mensajes, cancelación y conversión transaccional en reserva compatible con fecha/franja/profesional                                                                                                 |
| `/admin/agenda/configuracion`    | `ConfigurationPage`: políticas reales, edición solo con permiso específico                                                                                                                                            |

`AgendaFeedback` centraliza errores seguros, validaciones de campos y reintento de la misma operación pendiente. Calendario propio con Angular/CSS: no se instalaron dependencias, no hay licencia premium ni componentes de terceros nuevos. En celular se presenta una secuencia de días accesible sin desplazamiento horizontal; tablet y escritorio usan columnas.

## Capas y archivos de esta entrega

`src/app/features/agenda/`:

- `domain/agenda.ts`, `domain/agenda.spec.ts`: contratos tipados, rangos de calendario, zona Lima, límites semiabiertos, conversión explícita de hora local.
- `infrastructure/agenda-api.ts`, `infrastructure/agenda-api.spec.ts`: HTTP real, paginación limitada, snapshots para filtros y validación de pertenencia de anticipos.
- `application/agenda-intent.ts`, `application/agenda-intent.spec.ts`: protección de intención, UUID estable, digest, duplicación, concurrencia de UI y aislamiento por actor.
- `presentation/calendar-page.ts`, `booking-page.ts`, `appointment-page.ts`, `professionals-page.ts`, `blocks-page.ts`, `waitlist-page.ts`, `configuration-page.ts`: pantallas standalone con Signals y Reactive Forms.
- `presentation/service-picker.ts`, `slot-picker.ts`, `slot-picker.spec.ts`, `advances-panel.ts`, `agenda-feedback.ts`: componentes reutilizables y pruebas de cancelación de consultas/privacidad.
- `agenda.routes.ts`: rutas lazy y guards específicos.

Archivos compartidos modificados:

- `src/app/app.routes.ts`: sustituye únicamente el placeholder de agenda por rutas reales.
- `src/app/core/config/navigation.ts`: agenda disponible en navegación autorizada.
- `src/app/core/auth/domain/session.ts`: retorno seguro a rutas de Fase 6.
- `src/app/core/http/api-failure.ts`: mensajes de conflicto y políticas de agenda basados en códigos del servidor, sin exponer errores internos.
- `src/styles/agenda.scss`, `src/styles.scss`: calendario y responsive.
- `e2e/phase6.spec.ts`, `e2e/helpers.ts`: recorridos reales y tipado de fixtures.
- `../Backend/scripts/frontend_agenda_fixture.py`, `../Backend/scripts/frontend_e2e_server.py`: fixtures sintéticos exclusivos de bases `frontend_e2e_*`; agrega rol lector y datos separados de Fases 4/5. Ninguna ruta normal de la aplicación importa el seeder.
- `docs/phase6-api-inventory.md`, este informe: contratos, dependencias y resultados.

No se modificó ninguna migración, tabla, restricción ni regla financiera/de disponibilidad del backend. No se cambió el esquema de producción. No se incorporaron WhatsApp, microservicios, reserva pública ni PWA.

## Seguridad e integridad

Los guards y botones aplican permisos de experiencia de usuario; Django conserva la autorización definitiva. Cada mutación utiliza CSRF y UUID. Doble clic no crea otro envío. Cambiar datos mientras existe una respuesta incierta no inicia otra intención. Un conflicto definitivo de disponibilidad invalida el hueco y obliga a consultar otra vez. Solicitudes obsoletas de disponibilidad se cancelan con RxJS; cambios de fecha/profesional/servicios invalidan selección y revisión.

Precios, duración, anticipo y saldos provienen de Django. Angular no confirma ingresos por marcar una casilla, no convierte vencimiento local en estado oficial y no descuenta inventario. Reprogramación conserva snapshots. Cancelar cita no equivale a reembolso. Un anticipo confirmado no se puede anular desde este módulo como si nunca hubiera ingresado dinero; su aplicación a ventas reutiliza la Fase 4.

La ficha se vuelve a consultar al llegar el plazo de pago; solo muestra el estado devuelto. La acción administrativa de expiración ejecuta Django. Una llegada se vincula por su ID, exige identidad verificada, misma clienta, compatibilidad horaria y unicidad del backend. Los datos de agenda, notas, importes, teléfono y tokens no se persisten en almacenamiento del navegador. Se conservan solo metadatos de idempotencia y un digest; tampoco se registran payloads en logs de aplicación.

La API de profesionales expone comisiones a roles lectores. La interfaz restringe esas consultas y bloquea la selección dependiente para roles no administrativos, pero la corrección de autorización HTTP está pendiente en Django. El cierre de fase permanece bloqueado por esta incidencia. Detalle, evidencia de código y contrato propuesto en [inventario de APIs](phase6-api-inventory.md).

## Pruebas y resultados

Resultados confirmados:

| Comando                                                                                   | Resultado                                                                                                   |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `npm run build`                                                                           | Compilación Angular de producción correcta; carga lazy de agenda                                            |
| `npm run typecheck`                                                                       | Correcto                                                                                                    |
| `npm run lint`                                                                            | Correcto después de asociar explícitamente el selector de profesional a su etiqueta                         |
| `npm test`                                                                                | **148/148 correctas**, 31 archivos, 5.87 s                                                                  |
| `Backend/.venv/Scripts/python.exe -X utf8 Backend/scripts/frontend_backend_regression.py` | **373/373 correctas**; 107.655 s, PostgreSQL aislado destruido al finalizar                                 |
| `npm run e2e -- phase6.spec.ts --max-failures=1`                                          | **12/12 correctas** en la repeticion final, Django HTTP real + PostgreSQL temporal + Chromium HTTPS; 55.5 s |
| `npm run e2e -- --max-failures=1`                                                         | **88/88 correctas**, 0 omitidas, 0 fallidas y 0 flaky; 342.495 s                                            |

Cobertura nueva: aritmética de calendario/Lima, fechas inválidas, rutas de retorno, contratos HTTP/CSRF/UUID, paginación, pertenencia de anticipos a la cita, doble clic, 409, respuesta perdida, digest y reintento tras recarga, separación por usuario, cancelación de disponibilidad obsoleta y bloqueo de consultas por privacidad.

Los 12 E2E nuevos comprueban reserva guiada → anticipo → confirmación, reprogramación/cancelación, 409 real después de consultar un hueco, espera → oferta manual → cita, profesionales/especialidades/horarios, bloqueos/retiro, políticas, CSRF y permisos, llegada → única visita, estado EXPIRADA y pérdida real de respuesta de anticipo (Django persiste; el navegador pierde la respuesta; reintento conserva UUID y queda una sola fila).

El calendario pasó Axe WCAG 2 A/AA y comprobación de ausencia de desbordamiento horizontal a 390, 768 y 1440 px. Las capturas del recorrido integral se generan en `.artifacts/phase6-calendar-{390,768,1440}.png`, con datos sintéticos de prueba claramente separados de la aplicación final. Las APIs productivas no usan fixtures.

Durante la validación se corrigieron nombres accesibles de selectores, filtro real `cita` para anticipos y requisito `requiere_anticipo` del servicio de prueba. Ninguno se resolvió inventando respuestas. El backend no acepta `cita_id` como filtro de anticipos y puede ignorarlo: por eso existe una comprobación adicional de pertenencia en Angular.

## Pendientes y límites de cierre

1. **Bloqueante de seguridad/alcance:** proteger comisiones en el backend y comprobar un rol gestor sin permisos de administración de profesionales. Las consultas y funcionalidades dependientes están restringidas en la interfaz; no se declara autorización de campos resuelta.
2. Recuperación operativa después de recargar sin recordar el formulario: falta endpoint de consulta de intención para agenda/registro-confirmación-anulación de anticipos. Existe reintento seguro de mismo cuerpo/clave, pero no se simula recuperación por GET. Si no se puede reconstruir el formulario exacto, requiere revisión administrativa.
3. Disponibilidad para reprogramación con snapshots históricos y filtro de servicio directo del calendario: contratos recomendados, no añadidos al backend. Ante incompatibilidad se muestra el rechazo de Django y no se fuerza la reserva.
4. No se ha comprobado activación/configuración en producción ni se realizó despliegue. La auditoría funcional y pruebas corresponden al código local y PostgreSQL temporal.
5. Las pruebas obligatorias ejecutadas pasan. Eso no elimina el bloqueo de permisos del backend ni demuestra preparacion de produccion.

## Guía de uso

El [manifiesto de archivos](phase6-files.json) y los [resultados resumidos](phase6-test-results.json) acompañan esta entrega. La regresión integral de 88 casos se ejecutó antes del ajuste final de presentación de botones y del tratamiento diferenciado de rechazos 403 de política transaccional. Después se repitieron las 148 pruebas frontend y los 12 E2E de agenda sobre la compilación final. Las pruebas específicas del 403 permiten corregir una cancelación tardía rechazada sin liberar una intención ante un rechazo genérico de permisos.

Los cambios previos de Fases 4 y 5 se conservan como dependencias en la rama de revisión `frontend/fase-6-agenda-review`. Esta entrega no se fusiona a `main` ni se despliega.

Entrar con sesión staff/MFA y permisos correspondientes. En Agenda, elegir vista/fecha/filtros y abrir o crear una cita. Seleccionar ficha activa validada, servicios, profesional y hueco de Django; revisar precios y confirmar reserva. Registrar un anticipo pendiente cuando corresponda y confirmar únicamente tras verificar el cobro real. Confirmar la cita con la acción administrativa independiente. Para llegada, verificar identidad en la bandeja, copiar el ID confirmado y vincularlo desde la cita; abrir la visita existente para continuar la atención y caja.

Para lista de espera, elegir clienta/servicio/fecha/franja; registrar oferta manual solo si ocurrió y consultar nuevamente disponibilidad antes de convertir. Para horarios o bloqueos afectados por citas futuras, resolver primero las citas; no omitir conflictos mediante cambios directos de inventario o SQL.
