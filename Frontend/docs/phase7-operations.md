# Operaciones y preparación comercial

**Estado: preparación local; NO-GO para producción hasta completar la aceptación remota y la aprobación explícita del propietario.** No ejecutar los comandos de publicación durante una revisión de código.

## Topología y separación

Dos servicios de aplicación del mismo monolito: Angular compilado en Nginx y Django/Gunicorn. PostgreSQL permanece en red privada. El navegador solo ve el dominio HTTPS del frontend y `/api/`; no recibe `DATABASE_URL`, secretos Django/MFA ni direcciones privadas de PostgreSQL. Staging y producción necesitan proyectos/entornos, bases, usuarios, claves MFA, secretos, dominios y credenciales de backup distintos.

`Frontend/deployment/Dockerfile` compila con Node 24.15.0 y lockfile (`npm ci`), y copia solo el resultado a Nginx fijado por digest. Se ejecuta como UID/GID 10001, puerto no privilegiado, directorios temporales bajo `/tmp/nginx`. El entrypoint valida puerto, origen interno y orígenes de imágenes antes de generar configuración; no interpola valores arbitrarios en shell ni ejecuta migraciones.

`Frontend/railway.toml` define build y healthcheck. Para subida CLI con `--path-as-root`, el contenido de `Frontend` es la raíz del archivo enviado y del servicio; no configurar además una segunda raíz `/Frontend` dentro de ese archivo. Para una integración directa con GitHub, configurar raíz `/Frontend` en Railway. No mezclar ambos modos. La ruta de Dockerfile es `deployment/Dockerfile` respecto de esa raíz.

## Variables y proxy

Usar `deployment/.env.staging.example` como lista de variables, nunca como secretos reales:

- Frontend: `PORT`, `DJANGO_UPSTREAM` (origen interno exacto), `CATALOG_IMAGE_SOURCES` (orígenes HTTPS exactos, coherentes con la lista permitida de Django).
- Backend: settings staging/production, host público exacto, origen CSRF HTTPS, secretos independientes, CA de PostgreSQL y `verify-full`, aviso real de privacidad versionado y formulario público HTTPS. Ver ejemplos existentes en `Backend/deployment`.
- Configurar `TRUST_PROXY_HTTPS=True` solo si se verifica que Railway termina TLS y el frontend es el proxy confiable. No exponer Django directamente al navegador ni confiar en cabeceras reenviadas por clientes externos.
- El proxy rechaza tráfico de aplicación sin `X-Forwarded-Proto: https`; `/health` queda disponible para la sonda interna. En un ensayo local de contenedor ese encabezado solo simula el borde; no demuestra HTTPS comercial.
- El proxy borra cabeceras reenviadas no utilizadas, preserva Host para validación Django, verifica certificados si el upstream es HTTPS y no registra querystrings ni cuerpos en access logs.

Nginx aplica CSP sin scripts inline/eval, `nosniff`, DENY, Referrer-Policy, Permissions-Policy y HSTS conservador. `style-src 'unsafe-inline'` se mantiene por estilos dinámicos de Angular Material y estilos locales existentes; no se habilitan Trusted Types sin una validación específica adicional. HSTS para todos los subdominios y preload **no** se activa sin revisar dominios completos. `check --deploy` informa W005/W021; no se ocultan esas advertencias ni se presenta la configuración sintética como una revisión de dominios comerciales.

SPA fallback solo para navegación UI. APIs y salud se envían a Django; recursos estáticos ausentes responden 404, no HTML. `/api` sin barra también responde 404. `/health` acredita Nginx y el shell compilado; `/health/ready` acredita el backend y sus verificaciones de preparación. Ninguna sonda aislada demuestra disponibilidad continua.

## Caché y PWA

- `index.html`, manifest de versión del SW y respuestas privadas: sin almacenamiento de API. JS/CSS con hash y fuentes de build pueden tener caché larga; iconos, un día. No hay caché de proxy para `/api/`.
- `ngsw-config.json`: solo archivos estáticos de la compilación; `dataGroups: []`, sin patrones de URLs runtime. `check-build.mjs` verifica el manifest generado y escanea artefactos compilados.
- Offline: shell y aviso; formularios deshabilitados y mutaciones bloqueadas antes de HTTP. No hay cola, sincronización, cobro, cita ni llegada offline. Los campos abiertos permanecen en RAM de la pestaña, sin persistencia de datos sensibles.
- Actualización lista o versión irrecuperable: bloquear nuevas operaciones y solicitar recarga. Se advierte antes de descartar formularios. No se llama a `activateUpdate()` en una pestaña con módulos antiguos.
- La compatibilidad también se impone en Django con `X-Beauty-Contract`. Mantener contratos compatibles entre versiones durante rollout. No cambiar ese valor para evitar errores; una incompatibilidad es un bloqueo, no una razón para repetir pagos con otra UUID.
- No borrar intenciones pendientes al limpiar caché o cerrar sesión. Cambiar de usuario aísla las operaciones; al regresar al actor original se recupera su resultado en Django. Una respuesta perdida no se reemplaza por otro cobro.

La [configuración oficial del SW de Angular](https://angular.dev/ecosystem/service-workers/config) fundamenta la lista estática y la exclusión de datos; la [guía de actualizaciones](https://angular.dev/ecosystem/service-workers/communications) explica la detección de versiones. Las pruebas locales comprueban ese comportamiento con el SW real, no solo con observables simulados.

## CI/CD y aprobación

`frontend-ci.yml` ejecuta instalación reproducible, formato, lint, tipos, unitarias/HTTP/componentes, producción, chequeo de build, auditoría npm, chequeos Django, escaneo, E2E reales con PostgreSQL desechable, restauración cifrada, Nginx real en Docker y Trivy. `backend-ci.yml` conserva las pruebas y controles propios del backend.

El arnés acepta una URL de PostgreSQL de CI únicamente con `CI=true`, host localhost y base `beauty_ci`/`postgres`. Siempre crea otra base aleatoria `frontend_e2e_*`; nunca vacía una base compartida. Para pruebas locales utiliza el rol privado de restauración existente sin imprimir sus credenciales. Los certificados de prueba se confían únicamente en Chromium para la clave pública generada por ese arnés; no se modifica el almacén de confianza del sistema. Esto no acredita un certificado comercial.

Las pruebas de negocio con inyección de fallos usan contextos sin SW para que las rutas de prueba no sean interceptadas por un worker. Los casos específicos de caché, offline, actualización y UAT integral habilitan el SW real. No se afirma que probar un caso con SW deshabilitado pruebe la PWA.

Antes de activar automatización remota, el propietario debe configurar:

1. Branch protection para `main`, revisiones y checks obligatorios de ambos workflows.
2. Environments `staging` y `production`, con aprobadores requeridos para producción y secretos separados.
3. Variables/IDs de proyecto, servicio y entorno explícitos. No se permite creación automática de proyectos por scripts.
4. `STAGING_DEPLOY_ENABLED=true` solo después de configurar el servicio y su base aislada. El job staging depende de quality y solo se ejecuta en un push a `main`.
5. Producción: `PRODUCTION_DEPLOY_ENABLED=true`, dispatch manual con `APPROVE_PRODUCTION_<SHA completo>`, environment aprobado y `PRODUCTION_GO_ATTESTATION` verificada para ese mismo commit. Esa atestación protegida contiene `production_decision: GO`, `verified_commit` y todos los indicadores exigidos por `release_gate.py`. El archivo de esta entrega contiene **NO-GO**. No existe una autoaprobación en el código.

La atestación se vincula externamente al SHA, evitando un archivo de evidencia que intentara contener el hash del propio commit. Debe emitirse después de comprobar staging, contenedores, restauración, alertas, rollback y aprobación del propietario. No cambiar booleans sin evidencia. Los tokens Railway solo están disponibles en el job de despliegue de su environment.

El comando preparado usa CLI fijada y `railway up Frontend --path-as-root --project ... --service ... --environment ... --ci`; no se ejecutó en esta sesión. Contrastar con la [referencia oficial Railway](https://docs.railway.com/cli/up). No se usa `--detach` como prueba de lanzamiento exitoso. Los [healthchecks de Railway](https://docs.railway.com/deployments/healthchecks) verifican el despliegue y no sustituyen vigilancia externa.

## Aceptación en staging

Después de autorización/configuración del entorno aislado: publicar backend y frontend compatibles, verificar HTTPS válido, CA/hostname de PostgreSQL, host/origen CSRF, MFA, límites, aviso de privacidad real y cierre remoto de sesiones. Ejecutar la misma matriz de QR → identidad → visita → venta/consumos → pago → indicadores → Excel, agenda/anticipo/espera y concurrencia. Usar cuentas y datos sintéticos segregados, nunca limpiar producción. El arnés local no equivale a esa ejecución remota.

Comprobar Nginx `/health`, readiness, `/api` y rutas API desconocidas sin fallback, tipos MIME, no-store, CSP, certificados, cookies HttpOnly/Secure/SameSite, aislamiento de permisos, actualización de SW de dos releases y ausencia de APIs/datos privados en Cache Storage. Registrar versión de imagen/SHA, resultados y responsable.

## Monitoreo, alertas e incidentes

Programar desde un monitor externo `python deployment/monitor.py https://DOMINIO` cada minuto. Comprueba TLS, `/health` y `/health/ready`, timeout y no-store sin acceder a clientas, ventas o cuerpos de respuesta. Configurar alertas tras tres fallas consecutivas y recuperación, con responsables y canal aprobados. Este script no envía mensajes a nadie por sí solo; entrega JSON y código de salida para el monitor.

Conservar métricas de 5xx, latencia p95, salud DB, errores de operaciones/CSRF/MFA, disco y antigüedad del último backup/ensayo de restauración. Identificadores de correlación seguros, sin payloads, teléfonos, correos, UUID de gestión QR ni querystrings personales. No activar analytics de terceros para pantallas privadas. Probar una caída controlada en staging y registrar entrega real de la alerta antes de GO.

Incidente de caja/inventario: bloquear nuevas operaciones del recurso afectado; recuperar UUID y estado oficial, conservar auditoría, conciliar en Django. No editar saldos ni stock por SQL, no cobrar de nuevo para reemplazar una respuesta desconocida y no anular un anticipo confirmado como si no existiera el ingreso.

## Respaldos y restauración

Reutilizar `Backend/scripts/backup_database.py` y `restore_verify.py`: snapshot consistente, cifrado autenticado, fingerprints de filas/esquema y restauración únicamente en base nueva. Mantener copia externa privada, política de retención, claves cifradas separadas del backup, rol de solo lectura para copia y credenciales de restauración custodiadas. No almacenar backups ni secretos en Git o la imagen frontend.

Esta fase ensayó una copia cifrada **exclusivamente de la base temporal**, con restauración de 52 tablas y coincidencia de filas/esquema. El ensayo no acredita permisos operativos de una base comercial, persistencia remota, retención, continuidad del job ni recuperación desde el proveedor de producción. Esas verificaciones quedan pendientes.

Propuesta inicial a aprobar: copia diaria, retención de 30 días y ensayo mensual; RPO de 24 h como máximo si se acepta ese riesgo. El RTO debe medirse en staging con volumen representativo; el tiempo de la pequeña fixture sintética no es un RTO comercial. Reaplicar y comprobar roles mínimos, revocaciones y grants tras restaurar: rollback de código no restaura roles ni datos.

## Rollback

1. Detener despliegues y nuevas escrituras si hay riesgo financiero. Registrar SHA/imagen frontend/backend, migraciones, estado de readiness y operaciones inciertas.
2. Recuperar intenciones pendientes antes de repetir acciones. Preservar sesión/actor y auditoría; no eliminar UUIDs como reparación.
3. Restaurar la imagen frontend previa y un backend compatible mediante el proveedor, con aprobación del responsable. Confirmar que el contrato declarado es compatible. No reutilizar tags mutables como identidad de release.
4. Probar manifest/versión del SW: la nueva versión debe detectarse; pedir recarga explícita y comprobar recuperación de sesiones/UUID. No publicar un worker que cachee APIs para resolver fallas de conectividad.
5. No ejecutar downgrade automático de PostgreSQL ni revertir migraciones ciegamente. Para cambios aditivos mantener compatibilidad; si una restauración de datos es inevitable, restaurar primero en otra base, verificar fingerprints/roles y autorizar un corte controlado con conciliación de operaciones posteriores al snapshot.
6. Validar `/health`, readiness, acceso, QR, reserva y flujo financiero con datos de staging. Registrar resultado y tiempo. El ensayo de rollback remoto no se ha ejecutado en esta sesión.

El [checklist oficial de Django](https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/) sirve de referencia; pasar un chequeo estático con valores de prueba no sustituye la validación del dominio, secretos y proveedor reales.
