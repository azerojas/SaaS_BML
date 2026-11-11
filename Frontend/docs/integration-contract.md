# Contrato verificado — frontend fase 1

Fuentes: `Backend/config/urls.py`, `apps/autenticacion/{urls,views}.py`, `apps/operaciones/application/mfa.py`, middleware, permisos REST y OpenAPI 8.2.0. Las rutas `/api/v1/auth/*` propuestas en la skill no existen; se usan las reales, sin aliases.

| Método y ruta                       | Contrato                                                                                 | Uso                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------ |
| GET `/api/auth/csrf/`               | 200, cookie csrftoken; sin token JSON                                                    | Antes de operaciones de acceso       |
| POST `/api/auth/login/`             | `{username,password}` → 200 identidad o 202 `{mfa_required,setup_confirmation_required}` | Primer factor; 202 no concede acceso |
| POST `/api/auth/mfa/verify/`        | `{code}` → 200 `{mfa_verified,recovery_codes?}`                                          | TOTP o recuperación de un uso        |
| GET `/api/auth/me/`                 | 200 `{id,username,nombre,is_staff,permissions}`                                          | Identidad e hidratación              |
| POST `/api/auth/logout/`            | 204                                                                                      | Invalida sesión, requiere CSRF       |
| GET `/health/live`, `/health/ready` | Diagnóstico                                                                              | No sustituye `/me`                   |

`permissions` contiene permisos efectivos ordenados `app_label.codename`. Se añadió a `user_data` y al esquema Admin sin migraciones ni datos sensibles. DTO manual estricto para este contrato acotado; no se genera un cliente de módulos futuros.

Errores: `credenciales_invalidas` 401; `not_authenticated` y `mfa_required` 403 cierran acceso; `permission_denied` 403 conserva sesión; `csrf` 403 avisa sin bucle; `limite_login` y bloqueo MFA 429. Otros 400/404/409/500/503, timeout y red muestran mensajes generales sin detalles internos. Un usuario sin dispositivo MFA aprovisionado es rechazado por Django; la ayuda indica contactar a administración. No se aprovisionan secretos desde Angular.

HttpClient usa `/api/` relativo, cookies, timeout de 10 segundos y XSRF integrado: lee `csrftoken`, envía `X-CSRFToken` en métodos mutantes del mismo origen. `sessionid` sigue HttpOnly; ambas cookies Secure y SameSite=Lax en HTTPS. No se envían credenciales a URLs externas. Django mantiene CSRF incluso en login anónimo y autoriza cada petición.

Una única promesa coordina `/me` antes de mostrar el área privada y tras refrescar. La siguiente petición protegida o volver a mostrar la pestaña detecta caducidad; no hay push de expiración. Logout fallido por red limpia el estado visible y muestra advertencia/reintento; una recarga completa puede restaurar la sesión que el servidor no logró cerrar. No se anuncia un cierre remoto sin confirmación.

Retorno limitado a `/admin` y módulos enumerados; se rechazan URLs externas, escapes, query strings y traversal. `/registro/:token` es una reserva de presentación, sin procesamiento QR.

Permisos de navegación: `agenda.view_agenda`, `negocio.view_clientas`, `negocio.view_servicios`, `negocio.view_articulos`, `finanzas.view_finance`, `reporting.view_summary`. Los módulos solo presentan “en preparación”. No se confunde visibilidad con autorización.

Fuentes oficiales: [seguridad Angular](https://angular.dev/best-practices/security), [compatibilidad](https://angular.dev/reference/versions), [Tailwind Angular](https://tailwindcss.com/docs/installation/framework-guides/angular).
