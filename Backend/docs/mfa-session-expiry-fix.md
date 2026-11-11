# Recuperación del acceso tras vencer el desafío MFA

11 de noviembre de 2026. La cuenta local usa TOTP de seis dígitos cada 30 segundos. Se verificó en lectura que el secreto del QR privado coincide con el dispositivo cifrado de la cuenta; no hay bloqueo ni intentos fallidos acumulados. El reloj del contenedor y Windows difieren menos de un segundo. No se verificó el reloj del teléfono.

Los rechazos observados devolvían 401 sin incrementar intentos del dispositivo. El flujo rechazaba el desafío de sesión antes de comprobar TOTP: una sesión ausente, vencida o invalidada compartía el código `mfa_invalid` con un código TOTP incorrecto. La UI recomendaba probar otro código y mantenía al usuario en un paso que ya no podía completar. El desafío dura cinco minutos; configurar una app después de introducir la contraseña puede superar ese plazo.

Se distingue HTTP 401 `mfa_challenge_expired` para desafío ausente/vencido o invalidado por cambio de contraseña. Angular limpia el estado de acceso y vuelve al formulario inicial con el mensaje de iniciar sesión nuevamente. Un código TOTP incorrecto conserva `mfa_invalid` y permite reintentar dentro de un desafío vigente.

No se modifican la duración, tolerancia de un intervalo, protección contra repetición, CSRF, límites de intentos, secretos, QR, contraseñas ni permisos. No hay migraciones ni modificaciones de datos de negocio. Se documenta el nuevo código en OpenAPI 8.4.1.

Archivos: `apps/operaciones/application/mfa.py`, `apps/operaciones/tests/test_mfa.py`, `docs/openapi.json`; frontend `core/auth/application/session-store.ts` y su spec, `core/http/api-failure.ts`, `e2e/auth.spec.ts`.

Verificación: la prueba Python comprueba expiración a seis minutos, ausencia posterior de candidato, cero penalizaciones del dispositivo y cambio de contraseña. Dos pruebas frontend diferencian desafío vencido y código incorrecto. E2E elimina la sesión exclusivamente en PostgreSQL aislado, verifica el retorno al primer factor y completa un nuevo login MFA contra Django real.

Resultados ejecutados: 51 pruebas frontend aprobadas; 17 E2E de autenticación aprobadas en 1.5 minutos; regresión completa backend de 368 pruebas aprobada en PostgreSQL aislado. Lint de 106 archivos, TypeScript, formato de 142 archivos y build correctos. Build inicial 318.72 kB, transferencia estimada 86.40 kB. La verificación en lectura del QR actual también confirmó que su código sería elegible respecto a la protección de repetición, sin consumirlo ni actualizar el dispositivo.

Evidencia: `backups/mfa-expiry-backend-regression.log`, `Frontend/.artifacts/mfa-expiry-e2e-results.json` y `mfa-expiry-e2e-backend.log`. La imagen Docker local se reconstruyó para incluir la corrección. No se ejecutaron inicios de sesión de prueba con la cuenta real ni reinicios de su MFA.

Activación comprobada con CA explícita: GET csrf respondió 200 y POST MFA sin candidato respondió 401 `mfa_challenge_expired`, sin asociarse a una cuenta ni consumir TOTP. En estas comprobaciones también se observaron timeouts/readiness 503 intermitentes y respuestas locales lentas. Una comprobación posterior de tres consultas PostgreSQL desde el contenedor tardó 0.280/0.123/0.034 segundos. No se atribuye esa intermitencia al código del teléfono ni se declara resuelta; es un hallazgo operativo separado del desafío vencido. No se desactivaron timeouts, verificaciones TLS ni controles de salud para ocultarlo.

Reversión: restaurar esos archivos y los builds anteriores. No requiere restaurar datos ni cambiar el QR. Volver al comportamiento anterior recuperaría el mensaje ambiguo, sin modificar la verificación TOTP.

Uso: recargar el login, introducir usuario y contraseña nuevamente y usar el código actual del autenticador ya vinculado. No es necesario escanear de nuevo el QR. No se generan códigos temporales ni se usa recuperación para omitir el segundo factor.
