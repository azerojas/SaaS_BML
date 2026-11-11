# Informe técnico — frontend fase 1

Fecha: 10 de noviembre de 2026, America/Lima. Skill aplicada: `beauty-manager-frontend-fase-1`, leída desde `C:/Users/Usuario/Downloads/SKILL.md`. Sus archivos auxiliares `references/api-contract.md`, `security.md` y `test-checklist.md` no fueron suministrados ni encontrados; se siguieron sus requisitos explícitos y se cotejó el contrato directamente con Django. No se atribuye lectura a archivos inexistentes.

## Auditoría inicial

Frontend estaba vacío; no había package.json ni aplicación que preservar. El backend existente es Django 5.2.19, DRF 3.18.3, psycopg 3.3.8 y PostgreSQL local 18.6. No se asumió que las ocho fases documentadas equivalían a una publicación comercial.

| Capacidad backend       | Implementación observada                           | Límites                                                                  |
| ----------------------- | -------------------------------------------------- | ------------------------------------------------------------------------ |
| Acceso y clientas       | autenticacion, clientas, modelos negocio, permisos | API de sesión en `/api/auth/`, no `/api/v1/auth/`                        |
| Catálogo                | apps/catalogo, routers público/administrativo      | Imágenes sujetas a dominios autorizados                                  |
| Inventario              | apps/inventario: compras, movimientos, recepción   | No trasladar sus decisiones a Angular                                    |
| QR                      | apps/checkin: registro y llegada                   | Aviso local de prueba; no flujo QR frontend en esta fase                 |
| Visitas, ventas y pagos | apps/finanzas, idempotencia y transacciones        | Caja requiere evidencia, no inferir cobros de ventas                     |
| Dashboard/exportación   | apps/reporting, vistas, Excel                      | Conciliación vigente puede bloquear indicadores no justificables         |
| Agenda                  | apps/agenda, disponibilidad, concurrencia          | No se implementan pantallas de reservas en fase 1                        |
| Operaciones/seguridad   | apps/operaciones, MFA, health, tareas, backups     | Persiste NO-GO comercial descrito en Backend/docs/six-controls-report.md |

Las 34 tablas y 7 vistas son el origen histórico. La evidencia operativa previa contabiliza 52 tablas tras Django y soporte; esta fase no crea ni migra tablas en Lasheo. Las migraciones del arnés se ejecutan solo en PostgreSQL efímero vacío. Se ejecutó nuevamente toda la regresión del backend: 360 pruebas aprobadas, no solo se revisaron informes antiguos.

## Implementación y archivos

Inventario completo: [phase1-files.json](phase1-files.json). Código Angular: `src/app/core/auth/{domain,application,infrastructure,presentation}`, `core/{http,guards,config}`, `shared/ui`, `layouts/{admin-layout,auth-layout,public-layout}`, `features/{dashboard,foundation}`; configuración `app.config.ts`, `app.routes.ts`, `styles.scss`, angular/tsconfig, ESLint, Prettier y PostCSS.

Pruebas en cinco archivos `src/**/*.spec.ts`, `e2e/auth.spec.ts`, Playwright y `scripts/{run-e2e,e2e-server}.mjs`. Instalación/arranque en [README](../README.md). Contrato exacto y endpoints integrados en [integration-contract.md](integration-contract.md).

Cambios Django acotados: `apps/autenticacion/views.py` añade permisos efectivos a identidad, test de ausencia de datos sensibles en `tests.py`, OpenAPI actualizado a 8.2.0. `deployment/start_local_operation.py` selecciona Nginx con frontend cuando existe el build; nuevo `nginx.frontend.local.conf` sirve SPA y API HTTPS mismo origen. Nuevos `config/settings/frontend_e2e.py`, `scripts/frontend_e2e_server.py` y `frontend_backend_regression.py` son infraestructura de prueba. No se añaden rutas de control a la aplicación real.

Versiones frontend exactas: Angular core/compiler 22.2.5; CLI/build y Material/CDK 22.2.6; TypeScript 6.0.3; RxJS 7.8.2; Tailwind 4.3.5; Vitest 5.1.0; Playwright 1.65.0. Node 24.15.0 y npm 11.12.1. Manrope se sirve localmente, sin peticiones a Google Fonts. Standalone, OnPush, carga diferida, Signals y RxJS, tipos y plantillas estrictos. Inicial JS/CSS aproximadamente 303.3 kB, transferencia estimada 81.9 kB; no equivale a una medición de red real.

## Pruebas y aceptación

| Criterio                             | Implementado | Probado / evidencia                                                                          | Pendiente                                                |
| ------------------------------------ | ------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Instalación reproducible y versiones | Sí           | `npm ci`, 418 paquetes auditados, sin vulnerabilidades conocidas                             | Ninguno P0                                               |
| Compilación, lint y tipos            | Sí           | `npm run build`, `lint`, `typecheck`, `format:check`                                         | Ninguno P0                                               |
| Dominio/estado/HTTP/guards           | Sí           | 19 pruebas Vitest en 5 archivos                                                              | Navegadores adicionales P1                               |
| Acceso real y MFA                    | Sí           | E2E con Django y PostgreSQL: válido, inválido, no staff, TOTP, recuperación                  | Aprovisionamiento MFA permanece administrativo           |
| Sesión y logout                      | Sí           | Refresh `/me`, expiración real, cookies y cierre remoto; red caída con aviso/reintento       | No hay notificación push de expiración                   |
| CSRF y permisos                      | Sí           | Login sin CSRF 403, header real, backend sin permiso 403, guard conserva identidad           | Ninguno P0                                               |
| Público/privado y retorno seguro     | Sí           | URL externa rechazada, placeholder público sin acceso administrativo                         | QR funcional en fase posterior                           |
| Responsive y accesibilidad           | Sí           | 320/390/768/1440 px, sin overflow; axe WCAG 2 A/AA y 2.1 AA; teclado y drawer Escape         | Evaluación manual completa con lector de pantalla P1     |
| Regresión backend                    | Sí           | 360 pruebas OK, 213.727 s, base aislada eliminada                                            | Ninguno de este cambio                                   |
| Servicio local                       | Sí           | SPA y rutas profundas 200, CSS correcto, health 200, `/me` anónimo 403; TLS con CA explícita | Confianza de CA del navegador a decisión del propietario |

E2E: 16 casos contra aplicación compilada y servidor Django reales. Resultados en `.artifacts/e2e-results.json`; limpieza en `.artifacts/e2e-backend.log`. Unit tests usan HttpTestingController únicamente para comprobar escenarios de transporte/estado; el resultado de integración real procede de E2E, no de estos dobles. La regresión está en `Backend/backups/frontend-phase1-backend-regression.log`; rendimiento backend medido por su prueba: 1000 ventas/1000 detalles, 25 consultas, 0.784 s.

La repetición final tras `npm ci` aprobó los 16 E2E (aproximadamente 1.2 minutos) y 19 pruebas unitarias. Se verificó además el servidor de desarrollo 4210 por HTTPS con su CA, el proxy hacia Django, CSRF aceptado y validación 400 del cuerpo vacío. El puerto 4200 pertenece al contenedor de otro proyecto, `invicto-frontend`: no se detuvo ni modificó. Un ensayo interrumpido inicialmente dejó una base sintética sin conexiones; se comprobó su propietario/prefijo y se eliminó únicamente esa base exacta. Al cierre no quedan bases `frontend_e2e_*`.

No se inició sesión en la base principal como prueba funcional. Las comprobaciones locales públicas no generan ventas, citas, movimientos o usuarios. El origen de desarrollo `https://localhost:4210` se añadió explícitamente a los dos archivos privados runtime; el ensayo comprobó CSRF aceptado y payload vacío rechazado antes de autenticar. No se modificó la confianza TLS de Windows.

## Problemas corregidos y seguridad

- Permisos faltantes en `/me`: añadido campo efectivo, validación estricta y prueba; no se deducen permisos solo de is_staff.
- Acentos dañados en algunos títulos y selectores de prueba: corregidos como UTF-8; se repitieron los casos afectados.
- Sidebar en pantallas bajas ocultaba logout: scroll interno y adaptación por altura; prueba real de cierre pasa.
- Optimizador CSS insertaba script inline bloqueado por CSP: `inlineCritical:false` mantiene stylesheet normal y `script-src 'self'`, sin habilitar scripts inline. Se comprueba CSS cargado y errores del navegador.
- Contraste de texto secundario sobre crema insuficiente: token oscurecido; axe repetido en los cuatro tamaños.
- Minimatch transitorio vulnerable: override exacto 11.0.6, [aviso GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249); se verifican instalación, lint, build y pruebas con el override. `npm audit` final sin vulnerabilidades conocidas; no es garantía de ausencia absoluta de fallos.
- Logout sin red no anuncia éxito remoto y permite reintentar. La hidratación falla cerrada; recuperación MFA se conserva solo en memoria hasta descarga explícita. No hay tokens/passwords en almacenamiento web, logs o entornos compilados.

Nginx mantiene scripts del mismo origen, nosniff, denegación de iframes y cache no-store del index. Estilos inline permitidos para Material, decisión documentada; no se usa bypassSecurityTrust ni HTML no confiable. Los endpoints privados conservan no-store y permisos del backend.

## Reversión y decisión

Para retirar la UI, cambiar la selección `HAS_FRONTEND` a false en el arranque y reiniciar únicamente los contenedores locales identificados por `beauty.local.operation=true`; conserva base y credenciales. Para retirar el origen de desarrollo, eliminar exclusivamente `https://localhost:4210` de CSRF_TRUSTED_ORIGINS privado y reiniciar backend. El campo permissions es aditivo: mantenerlo para compatibilidad; retirarlo exigiría retirar primero este frontend. Los scripts de prueba eliminan solo bases aleatorias propias y carpetas temporales con padre/prefijo comprobados. No borrar respaldos ni restaurar sobre Lasheo para revertir presentación.

**GO para fase 1 frontend local**: todos los P0 anteriores fueron ejecutados y aprobados. Ningún CRUD, indicador financiero, agenda o QR frontend se declara terminado. **NO-GO para publicación comercial**: siguen los pendientes operativos previos (respaldo/avisos fuera del equipo, disco, responsables, despliegue/CI comercial y aviso legal); esta fase no los resuelve ni publica servicios externos.
