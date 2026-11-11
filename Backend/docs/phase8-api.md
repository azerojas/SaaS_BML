# Contratos Fase 8 para Angular

Contrato completo: [openapi.json](openapi.json), versión 8.0.0, 125 rutas. Regeneración completa: update_agenda_openapi.py seguido de update_operations_openapi.py. No cambian los nombres de rutas financieras ni de agenda.

| Método/ruta | Acceso | Resultado |
|---|---|---|
| GET /health/live | Público, sin DB | 200 proceso vivo |
| GET /health/ready | Público, mínimo | 200 listo; 503 DB/constraints/migraciones/rol no válidos |
| GET /api/auth/csrf/ | Público | Cookie CSRF; no concede acceso |
| POST /api/auth/login/ | CSRF + usuario/contraseña | 200 local sin MFA; 202 desafío MFA; 403 dispositivo no provisionado cuando se exige |
| POST /api/auth/mfa/verify/ | Cookie de desafío + CSRF | {"code":"123456"}; 200 segundo factor, 401 desafío/código inválido, 429 bloqueo, 503 clave no disponible |
| POST /api/auth/logout/ | Sesión + CSRF | 204 sin cuerpo |
| GET /api/v1/operations/status/ | Staff activo + operaciones.view_operations + MFA cuando se exige | Jobs y alertas sin PII; 503 soporte no activado |

Enviar credentials: include y X-CSRFToken en escrituras. Renovar el token CSRF tras login/segundo factor. El desafío dura 5 minutos; TOTP 30 segundos ±1 paso, sin reutilización; cinco fallos bloquean 15 minutos y además hay límite compartido por IP. Los seis códigos de recuperación aparecen una sola vez al confirmar la provisión; no guardarlos en logs/localStorage. Un código de recuperación revoca otras sesiones MFA. No hay endpoint público para provisionar dispositivos.

No leer JSON en logout 204. Tratar 202 como pantalla de segundo factor; no navegar al área privada hasta 200. Respuestas financieras usan cadenas Decimal, PEN. Conservar Idempotency-Key al repetir una operación después de perder una respuesta. 409 exige resolver conflicto, no repetir con otra clave automáticamente.

Los endpoints legacy de clientas, catálogo, proveedores, compras, inventario y QR ahora exigen permiso de modelo concreto. is_staff por sí solo no concede acceso. Se separan view/add/change/delete; crear/asociar visita desde QR requiere además finanzas.manage_visits; enlazar cita requiere agenda.link_arrivals. Las acciones de finanzas/reporting/agenda conservan sus permisos específicos. Usuarios superadministradores mantienen acceso; dar permisos a cada puesto manualmente mediante administración autorizada.

Todas las respuestas privadas usan no-store; X-Request-ID lo genera el servidor. Solicitudes JSON mayores a 64 KiB se rechazan con 413. Las rutas de exportación existentes continúan protegidas y limitadas; Excel mantiene escape de fórmulas, sin macros. Catálogo solo acepta referencias URL en dominios expresamente permitidos: no hay carga binaria ni almacenamiento persistente de imágenes contratado; no abrir una lista global de dominios para habilitar fotos arbitrarias.

Los errores financieros mantienen {code,detail}, DRF conserva validaciones por campo. Los errores inesperados en staging/production son 500 genéricos sin traza; request_id permite correlación. Las pruebas de fallos se conservan con excepciones visibles en development/CI.
