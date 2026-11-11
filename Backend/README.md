# Lasheo — Backend

Fase 7: [agenda privada, profesionales, horarios, reservas y espera](docs/agenda-api.md), [OpenAPI 1.6.0](docs/openapi.json). **314 pruebas aprobadas** y diez permisos activados con autorización el 10 de noviembre de 2026, sin DDL de negocio. Esquema y filas originales preservados; consultas privadas verificadas con HTTP 200. Consultas públicas solo de lectura; sin reservas anónimas por teléfono ni WhatsApp. [Informe de entrega](apps/agenda/references/test-checklist.md) y [activación de permisos](apps/agenda/references/schema-map.md).

Fase 6: [dashboard financiero y reportes Excel](docs/reporting-api.md), [OpenAPI 1.5.0](docs/openapi.json). Reportes implementados y cuatro permisos activados con autorización, sin DDL de negocio: 267 pruebas aprobadas. La recaudación neta conciliada está bloqueada por falta de ledger de reembolsos: **no se declara la fase totalmente finalizada**. Ver [decisiones de esquema](apps/reporting/references/schema-map.md) e [informe de verificación](apps/reporting/references/test-checklist.md).

Fase 5 implementada y activada en Lasheo con autorización explícita: [visitas, ventas, consumos reales, pagos y anticipos](docs/finanzas-api.md). Contrato consolidado [OpenAPI 1.4.0](docs/openapi.json). La [migración de dos tablas](apps/finanzas/references/schema-map.md) preservó las estructuras y filas originales; [informe de verificación](apps/finanzas/references/test-checklist.md): 223 pruebas aprobadas. Sin aplicar esa migración en otros entornos, el módulo financiero responde 503.

Fase 4 implementada en modo ficticio: [check-in QR y recepción](docs/checkin-api.md), OpenAPI 1.3.0. Para la suite completa instalar requirements-dev.txt, que incluye el lector QR de pruebas.

Fase 3 implementada: [inventario, proveedores, compras y costos estimados](docs/inventario-api.md). Contrato consolidado actualizado a OpenAPI 1.2.0. No requiere cambios de esquema.

La fase 2 también está implementada: [catálogo, recetas, imágenes y stock de lectura](docs/catalogo-api.md). Contrato consolidado: [OpenAPI 1.1.0](docs/openapi.json). La fase 2 no necesita migraciones de esquema y mantiene los endpoints de fase 1.

Backend Django 5.2 / DRF con PostgreSQL existente. Incluye autenticación, clientas, catálogo, inventario, QR y el código financiero de Fase 5. Angular, agenda pública, reportes finales, notificaciones y despliegue quedan para fases posteriores.

## Estado verificado

- Base original: 34 tablas y 7 vistas, PostgreSQL 18.3.
- 34 modelos canónicos en `negocio.models`, todos con `managed=False`.
- Se añadieron las tablas estándar de Django y un contador persistente de intentos de login.
- Se restauraron 13 FK INTEGER a `auth_user.id`, después de comprobar tipos, ausencia de referencias huérfanas y respaldo.
- Se conservaron filas y definiciones originales de columnas, restricciones, índices, triggers, funciones y vistas. Comprobación guardada localmente en `backups/phase1-verification.json`.
- Pruebas HTTP, permisos, CSRF, reglas, concurrencia y persistencia usan exclusivamente una base temporal.

## Inicio en Windows PowerShell

Desde `Backend`:

```powershell
# Solo si necesitas crear de nuevo el entorno:
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

# En otra instalación, copiar y completar .env.example; conservar el .env existente aquí.
# Copy-Item .env.example .env
.\.venv\Scripts\python.exe manage.py check --database default
.\.venv\Scripts\python.exe manage.py runserver
```

Panel administrativo: http://127.0.0.1:8000/admin/. La API devuelve JSON; el frontend se implementará posteriormente. El panel estándar permite administrar usuarios; las clientas se gestionan por la API de esta fase.

Ya se creó una cuenta ficticia de prueba; sus credenciales se entregaron en el chat y no se guardan en el repositorio. Para crear otra cuenta de forma interactiva:

```powershell
.\.venv\Scripts\python.exe manage.py createsuperuser
```

Las clientas no tienen contraseña ni cuenta de usuario. Se requiere personal activo con `is_staff=True` para todos los endpoints privados.

## Configuración

`.env` está excluido de Git. Contiene conexión PostgreSQL, `SECRET_KEY`, `DJANGO_DEBUG`, hosts y orígenes. Se usa `DJANGO_DEBUG` porque Windows ya tenía una variable genérica `DEBUG=release`. Generar un secreto nuevo para otra instalación:

```powershell
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(64))"
```

Desarrollo: `DJANGO_DEBUG=True`, hosts `127.0.0.1,localhost`. Angular local autorizado: `http://localhost:4200`. Usar también Django en `http://localhost:8000` si Angular usa localhost; no mezclar localhost con 127.0.0.1 al probar cookies.

Producción futura: `DJANGO_DEBUG=False`, secreto propio, hosts y orígenes exactos, HTTPS. Así se activan cookies Secure, redirección HTTPS y HSTS. Preferir frontend y API bajo el mismo origen. No se confía automáticamente en `X-Forwarded-Proto` ni en `X-Forwarded-For`; el proxy debe configurarse y verificarse al desplegar. El contador usa REMOTE_ADDR: sin configuración de proxy todos sus clientes compartirán el límite de IP. Revisar el alcance HSTS de subdominios antes de publicar.

Las cookies de sesión son HttpOnly, SameSite=Lax y duran como máximo 8 horas; cerrar el navegador también termina la sesión de navegador. La cookie CSRF es legible por el frontend para construir la cabecera. Ninguna respuesta JSON devuelve contraseñas, cookies ni tokens.

## Contrato HTTP

Contrato OpenAPI 3.0.3: [docs/openapi.json](docs/openapi.json).

| Método | Ruta | Resultado |
|---|---|---|
| GET | /api/auth/csrf/ | Cookie CSRF; público |
| POST | /api/auth/login/ | Sesión administrativa; CSRF obligatorio |
| GET | /api/auth/me/ | Identidad mínima del personal autorizado |
| POST | /api/auth/logout/ | Cierra sesión; 204 |
| GET | /api/clientas/ | Lista privada paginada |
| POST | /api/clientas/ | Alta; 201 |
| GET | /api/clientas/{id}/ | Detalle privado |
| PATCH | /api/clientas/{id}/ | Edición parcial |
| POST | /api/clientas/{id}/desactivar/ | Baja lógica idempotente |
| POST | /api/clientas/{id}/reactivar/ | Reactivación idempotente |
| POST | /api/clientas/{id}/consentimiento/ | Registro explícito o revocación |

No hay registro público, DELETE físico ni PUT. Las respuestas API tienen `Cache-Control: no-store, private`.

### Cookies y CSRF para Angular

1. GET `/api/auth/csrf/` con credenciales.
2. Leer la cookie `csrftoken`; POST login con JSON `{"username":"...","password":"..."}` y cabecera `X-CSRFToken`.
3. Después del login, volver a leer la cookie: Django rota el secreto CSRF.
4. Enviar las cookies en todas las solicitudes y la cabecera CSRF en POST/PATCH y logout.
5. Para Angular en otro puerto: `withCredentials: true` y cabecera CSRF explícita en URLs absolutas. El soporte XSRF automático de Angular depende de la URL/origen; comprobarlo al implementar el frontend.

Un usuario anónimo o sin rol administrativo recibe 403 en rutas privadas. Un login con credenciales incorrectas, usuario inactivo o sin rol recibe el mismo 401 genérico. Un login sin CSRF recibe 403. Máximo 10 intentos por ventana fija de 15 minutos tanto por IP como por cuenta (configurable); se cuentan también los intentos exitosos. Los contadores se comparten entre procesos usando PostgreSQL y claves HMAC, sin almacenar usuario/IP en texto. El límite de cuenta puede afectar temporalmente a una cuenta atacada.

### Clientas

Ejemplo ficticio de alta:

```json
{
  "nombres": "Daniela",
  "apellidos": "Torres",
  "telefono": "+51999123456",
  "email": "daniela@example.com",
  "fecha_nacimiento": "2000-03-15",
  "notas_privadas": "Prefiere acabado natural"
}
```

Solo esos seis campos son escribibles en alta/PATCH; los tres primeros son obligatorios en alta. No se aceptan campos desconocidos ni estado/fechas/consentimiento enviados en esas rutas. Nombres y apellidos: máximo 120 caracteres y espacios normalizados. Email opcional válido; fecha de nacimiento no futura. Notas: máximo 10 000 caracteres.

Teléfonos: formato internacional con +, entre 8 y 15 dígitos. Se permiten espacios, paréntesis y guiones como presentación. Un celular peruano de 9 dígitos empezado en 9 se convierte explícitamente a +51. Los números internacionales sin + no se interpretan automáticamente. Se admiten fijos peruanos con código de área y móviles; no se comprueba si la línea está activa ni se envían mensajes.

Se compara también con formatos heredados normalizables, sin reescribirlos. Un bloqueo transaccional serializa las escrituras API de clientas para impedir carreras entre equivalencias; UNIQUE sigue protegiendo el número almacenado frente a escritores externos. Herramientas externas que ignoren este contrato podrían insertar otro formato equivalente: una restricción canónica física requeriría una migración posterior.

Alta: activa, sin consentimiento y sin recordatorios. El SQL heredado conserva sus defaults originales (recordatorios true y canal WHATSAPP), pero el servicio API establece false y EMAIL explícitamente; no hay funcionalidad de mensajería. Las fechas usan la hora transaccional de PostgreSQL, compatible con el trigger existente.

Lista: `?search=María%20Torres&activa=true&page=1&page_size=20`. Activas por defecto; `activa=false|all` permite ver bajas. Búsqueda por palabras, sin distinguir mayúsculas ni tildes latinas comunes, en nombres/apellidos/teléfono. Se normalizan espacios de la búsqueda; buscar teléfono usando dígitos sin separadores. Orden por apellido, nombre e ID. Máximo page_size 100. Respuesta:

```json
{"count": 1, "next": null, "previous": null, "results": [{"id": 1, "nombres": "Daniela", "apellidos": "Torres", "telefono": "+51999123456", "activa": true}]}
```

El listado omite email, nacimiento, notas y consentimientos. El detalle privado devuelve esos campos. Desactivar no elimina visitas ni historial; permite consultar y editar una ficha inactiva.

### Consentimiento

No se concede automáticamente. Primero definir y configurar el aviso real mediante `PRIVACY_NOTICE_URL` y `PRIVACY_NOTICE_VERSION`; ambos están vacíos intencionalmente. La acción rechaza solicitudes mientras falten. Ejemplo ficticio:

```json
{"otorgado": true, "evidencia": "ref-documento-ficticio-001", "version_aviso": "v1"}
```

El personal confirma que existe evidencia de la decisión de la clienta. El servidor asigna la fecha; nunca acepta una fecha aportada por el cliente. `otorgado=false` revoca y elimina la fecha del estado actual, conservando el evento en auditoría. La evidencia debe ser una referencia, sin copiar documentos ni datos sensibles. El esquema actual no tiene columnas de origen/versión en clientas: se conservan en auditoría la cuenta responsable, evidencia, versión y estado; el canal de captura y el archivo original requieren un diseño posterior. La API no puede verificar por sí sola la autenticidad de una evidencia externa.

### Errores

```json
{"code": "validacion", "detail": "Revisa los campos.", "errors": {"email": ["Introduzca una dirección de correo electrónico válida."]}}
```

```json
{"code": "telefono_duplicado", "detail": "Ya existe una clienta con este telefono."}
```

400: validación. 401: login fallido. 403: permisos/CSRF. 404: ficha/página inexistente. 405: método no permitido. 409: teléfono duplicado. 429: login limitado, con Retry-After. Los textos de validación pueden variar con la traducción; usar códigos y campos.

Las operaciones de clientas y su auditoría son atómicas. Auditoría registra nombres de campos cambiados, no sus valores ni notas/contacto completos. Un fallo de auditoría revierte la escritura.

## Pruebas reproducibles

```powershell
.\.venv\Scripts\python.exe manage.py test apps.autenticacion apps.clientas tests --noinput
```

El runner crea `test_lasheo_phase1_<aleatorio>`, carga `tests/legacy_schema.sql` sin filas ANTES de migrar y después ejecuta las pruebas. Incluye btree_gist, funciones, vistas, CHECK, índices y triggers reales. La base temporal se elimina al finalizar. No usar --keepdb ni --parallel; se rechazan para evitar reutilizar datos. El usuario PostgreSQL de desarrollo necesita CREATEDB y permisos para la extensión. No usar la cuenta de desarrollo postgres como usuario de aplicación en producción.

El snapshot procede de PostgreSQL 18; para otro motor/versión mayor hay que revisar compatibilidad. Nunca ejecutar el SQL de pruebas directamente sobre Lasheo.

Cobertura: sesiones reales/CSRF, anónimos y no administradores, login genérico y límite, CRUD lógico, validaciones, teléfonos equivalentes y carreras reales, paginación/búsqueda, trigger/defaults, consentimiento, integridad de visitas, auditoría atómica, 34 tablas/7 vistas y reversibilidad de los 13 FK.

```powershell
.\.venv\Scripts\python.exe manage.py check --deploy
```

Con configuración local aparecen cinco advertencias esperadas por DEBUG/HTTP, HSTS y cookies sin Secure. Con DJANGO_DEBUG=False el chequeo debe pasar; esto no sustituye verificar HTTPS/proxy/cookies en el despliegue.

## Respaldo y migraciones

Respaldo previo: archivo custom de pg_dump dentro de `backups/`, excluido de Git. Contiene datos: conservarlo en almacenamiento privado con respaldo externo antes de un despliegue.

`scripts/prepare_phase1.py` fue una captura inicial, no es un comando de uso diario: toma backup y genera modelos/snapshot del estado anterior a la fase. **No volver a ejecutarlo sobre esta base ya migrada.** `scripts/verify_backup.py` restaura el respaldo previo en una base temporal y valida 34 tablas/7 vistas, luego elimina únicamente esa base.

`scripts/apply_phase1.py` aplica migraciones aditivas verificando antes/después los conteos de filas y las huellas del esquema heredado. No es necesario repetirlo para arrancar el servidor.

La migración `integracion.0001_restore_user_links` verifica INTEGER y ausencia de huérfanos, luego añade 13 FK con ON DELETE SET NULL para conservar historial. Se probó retirar/reponer esas restricciones en aislamiento. Ninguna de las 45 FK originales se cambió.

Para retirar solo los 13 enlaces, después de respaldar y revisar el plan:

```powershell
.\.venv\Scripts\python.exe manage.py migrate integracion zero --plan
# Aplicar únicamente si esa reversión fue decidida:
# .\.venv\Scripts\python.exe manage.py migrate integracion zero
```

No revertir auth ni borrar sus tablas en una base con usuarios/historial. Una restauración completa debe ensayarse en una base nueva, comprobarse y cambiar la conexión de forma controlada; no superponer dumps a Lasheo. No ejecutar makemigrations para recrear negocio, flush, reset_db ni migrate --fake.

## Pendiente fuera de la implementación

Definir el aviso real de privacidad antes de usar consentimiento. Sustituir la cuenta de prueba antes de operar. Configurar PostgreSQL con un rol de mínimos privilegios, almacenamiento de respaldos y despliegue HTTPS en su fase correspondiente. No se implementó frontend ni WhatsApp.

Referencias: [bases heredadas Django](https://docs.djangoproject.com/en/5.2/howto/legacy-databases/), [SessionAuthentication DRF](https://www.django-rest-framework.org/api-guide/authentication/), [CSRF Django](https://docs.djangoproject.com/en/5.2/ref/csrf/).

