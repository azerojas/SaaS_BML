# Lasheo · Beauty Manager — frontend fases 1 a 5

Angular standalone integrado con sesiones Django, MFA y permisos reales. Incluye clientas, catálogo, inventario, compras, recepción/atención/caja y dashboard financiero/reportes. Agenda mantiene su aviso de preparación. No se presentan métricas ficticias.

La [entrega de Fase 5](docs/frontend-fase-5.md) incluye indicadores, evolución, rankings, gastos, alertas y Excel generado por Django. La [auditoría de analítica](docs/phase5-api-inventory.md) explica fechas inclusivas/exclusivas, permisos separados y caja condicionada a conciliación. Accesos: `/admin` con `reporting.view_summary`; `/admin/reportes` con alguno de los permisos de lectura de reportes. Exportar requiere además `reporting.export` y el permiso del reporte seleccionado.

La [entrega de Fase 4](docs/frontend-fase-4.md) documenta las pantallas QR, llegadas, visitas, consumos reales, ventas, pagos y anticipos existentes. Consulta la [matriz de contratos y permisos](docs/phase4-api-inventory.md) antes de habilitar recepción. `PUBLIC_CHECKIN_URL` debe apuntar a `https://<dominio-frontend>/registro/`; la operación con datos reales requiere aviso de privacidad aprobado y configuración HTTPS verificada.

## Pantallas de Fase 2

- `/admin/clientas`: búsqueda, filtros, paginación; alta, edición, ficha, consentimiento y estado.
- `/admin/catalogo/servicios`: tratamientos, atributos, publicación, recetas y galería.
- `/admin/catalogo/articulos`: productos/insumos, unidades, SKU, precio, stock mínimo y existencia solo lectura.
- `/admin/catalogo/categorias-servicio`, `/categorias-articulo` y `/unidades`: administración según permisos, bajo el prefijo `/admin/catalogo`.
- `/catalogo`, `/catalogo/servicios/:slug`, `/catalogo/productos/:slug`: consulta pública sin cuenta.

Fotografías mediante URLs HTTPS autorizadas por Django; no existe subida de archivos. Para el catálogo demo se autorizó exclusivamente images.pexels.com y se añadieron diez fotos referenciales. Las fuentes están documentadas en `Backend/docs/catalog-demo-images.md`; no son fotos de resultados propios. El consentimiento se registra desde la ficha después del alta, utilizando la versión vigente del aviso y la fecha del servidor. No se otorga automáticamente.

Contrato y permisos: [inventario API](docs/backend-api-inventory.md). Resultados y pendientes: [informe Fase 2](docs/frontend-fase-2.md).

## Pantallas de Fase 3

- `/admin/inventario`: existencias, filtros, mínimos, agotados y últimas entradas/salidas autorizadas.
- `/admin/inventario/articulos/:id`: ficha de stock, movimientos y usos en recetas.
- `/admin/inventario/movimientos`, `/admin/inventario/alertas`: historial inmutable y reposición.
- `/admin/inventario/ajustes/nuevo`: entrada/salida justificada, confirmación e idempotencia.
- `/admin/proveedores`, `/admin/proveedores/nuevo`, `/admin/proveedores/:id`: búsqueda, alta, edición y estado lógico.
- `/admin/compras`, `/admin/compras/nueva`, `/admin/compras/:id`, `/admin/compras/:id/editar`, `/admin/compras/:id/recepcion`: borradores, líneas, recepción y anulación.

Contrato: [API Fase 3](docs/phase3-api-inventory.md). Validación y límites: [informe Fase 3](docs/frontend-fase-3.md). No se cargan compras ni existencias ficticias en Lasheo para mostrar estas pantallas.

## Ejecución local

Node 24.15.0, npm 11.12.1. Versiones directas exactas y lockfile versionado.

```powershell
cd Frontend
npm ci
npm run build
cd ../Backend
.venv/Scripts/python.exe deployment/start_local_operation.py
```

Abrir **https://localhost:8443/login**. El arranque detecta `Frontend/dist/beauty-manager/browser/index.html` y sirve Angular y Django bajo el mismo origen HTTPS. No ejecuta migraciones. Si cambia Django, reconstruir primero con `.venv/Scripts/python.exe deployment/build_local.py`.

Usar la cuenta local ya aprovisionada. Credenciales y autenticador permanecen en `%USERPROFILE%/.codex/lasheo-private/local-operation/`; nunca se copian al frontend. La confianza de la CA en Windows fue cancelada previamente y no se fuerza aquí; puede aparecer una advertencia del navegador. No es despliegue comercial.

Para desarrollar con recarga: `npm start` en Frontend, abrir https://localhost:4210. El proxy verifica la CA de 8443 y conserva Origin; Django debe permitir exactamente `https://localhost:4210` en `CSRF_TRUSTED_ORIGINS` del entorno local. No desactivar CSRF. `.env.example` es una referencia pública, no se carga automáticamente. `BM_CA_FILE` permite otra CA pública para el proceso Node.

## Verificación

```powershell
npm run lint
npm run typecheck
npm run format:check
npm test
npm run build
npm run e2e
npm audit
```

E2E requiere Chromium (`npx playwright install chromium`), Python del backend y su rol privado local de restauración con CREATEDB. Crea una base `frontend_e2e_*`, carga esquema y migraciones únicamente allí, genera cuentas sintéticas y elimina la base al terminar. Ejecuta Django real y Angular compilado bajo HTTPS en localhost:4443. No suplanta respuestas de autenticación. Reset/caducidad son controles exclusivos del arnés con clave aleatoria; no están en las URLs Django ni se publican en Nginx.

Playwright acepta el certificado sintético solo en este ensayo aislado. Esto no demuestra confianza TLS comercial. El proxy de desarrollo y las comprobaciones operativas sí verifican su CA explícitamente. Arnés preparado para Windows local; no se afirma ejecución CI Linux ni otros navegadores.

Evidencia ignorada por Git: `.artifacts/e2e-results.json`, `.artifacts/e2e-backend.log`, capturas `.artifacts/*.png` y `playwright-report/`. Las capturas contienen exclusivamente cuentas sintéticas.

## Capas

`core/auth/domain` contiene tipos y reglas puras; `application` coordina Signals/RxJS; `infrastructure` adapta HTTP; `presentation` contiene formularios. `core/http`, `guards` y `config` concentran errores, caducidad y navegación. `shared/ui` ofrece botón, campo, alerta, loading, empty state, iconos y confirmación. Tres layouts y rutas diferidas separan administración, acceso y presentación pública.

Las páginas usan la capa de aplicación. Django decide autenticación, permisos y negocio. No hay JWT ni persistencia de credenciales/tokens en localStorage/sessionStorage. Fase 3 conserva únicamente UUID de intenciones pendientes en sessionStorage para recuperar operaciones sin duplicarlas.

Véanse [contrato de integración](docs/integration-contract.md) e [informe de aceptación](docs/phase1-report.md).

## Agenda y reservas — Fase 6

Implementación en `/admin/agenda`: calendario diario/semanal/mensual, profesionales, especialidades, horarios, bloqueos, citas, anticipos, lista de espera y enlace con llegadas. Consume Django real; no instala nuevas dependencias ni modifica el esquema de producción.

**Cierre bloqueado:** Django todavía expone comisiones a roles de solo lectura de agenda. Las consultas dependientes se restringen a administración en esta interfaz. No está validada para producción ni habilitada íntegramente para roles operativos limitados. Véanse el [informe técnico de Fase 6](docs/frontend-fase-6.md) y el [contrato, permisos y dependencias](docs/phase6-api-inventory.md), incluido el límite de recuperación de operaciones tras recargar.
