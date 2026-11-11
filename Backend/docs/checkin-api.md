# Lasheo — fase 4: llegada presencial por QR

Documentación: [contrato API](../apps/checkin/references/api-contract.md), [mapa SQL](../apps/checkin/references/schema-map.md), [seguridad](../apps/checkin/references/security.md), [pruebas](../apps/checkin/references/test-checklist.md).
Contrato consolidado: [OpenAPI](openapi.json), versión 1.3.0.

## Diagnóstico y decisiones

Las 122 pruebas de fases 1–3 se ejecutaron y pasaron antes de implementar. Django 5.2.19, DRF 3.18.3, psycopg 3.3.8 y PostgreSQL 18.3. Autenticación por sesión/IsAdminUser conservada, con las 13 FK a auth_user intactas.

Las tablas puntos_qr, clientas, llegadas y visitas ya existían, sin registros de esas entidades al iniciar esta fase. El negocio tenía un registro y se usa CHECKIN_PUBLIC_NAME=Lasheo como nombre público configurado. No se recreó ninguna tabla/vista ni se ejecutaron migraciones. Llegadas.clienta se corrigió a ForeignKey por su UNIQUE parcial, y se mapearon defaults reales en Python.

Se tomó respaldo completo y una huella del esquema y de filas de negocio. El respaldo de fase 4 se restauró en una base temporal, verificando 45 tablas físicas y 7 vistas. La comprobación final conserva las 34 tablas de negocio y sus datos originales.

El usuario eligió únicamente datos ficticios y un aviso local de prueba. No se redactó ni se aprobó un aviso legal real. Las fichas propuestas permanecen inactivas y con consentimiento no verificado; el personal debe confirmarlo presencialmente. El QR no verifica presencia ni identidad.

La lista/confirmación de personas es privada. La API pública no revela identidad ni existencia de teléfono y no tiene seguimiento público. No se implementaron reservas, cobros, inventario automático ni frontend Angular.

## Archivos y capas

| Archivo/directorio | Función |
|---|---|
| apps/checkin/presentation/ | DTO, HTTP privado/público, permisos y rutas |
| apps/checkin/application/ | Comandos transaccionales y consultas |
| apps/checkin/domain/rules.py | Regla pura de vigencia y transiciones |
| apps/checkin/infrastructure/ | QR Segno y rate limit PostgreSQL compartido con claves HMAC |
| apps/checkin/checks.py y apps.py | Validación de límites y bloqueos de configuración de despliegue |
| apps/checkin/management/commands/expire_checkins.py | Cancelación de pendientes antiguas |
| apps/checkin/tests/ | API, privacidad, flujos, lectura QR y concurrencia |
| negocio/models.py | Relación histórica correcta y defaults DB, managed=False |
| config/settings.py y urls.py | Configuración y registro del módulo |
| requirements.txt / requirements-dev.txt | Segno 1.6.6 / decodificador de pruebas zxing-cpp 3.1.1 |
| scripts/update_checkin_openapi.py | Generación del contrato consolidado |
| scripts/phase4_snapshot.py y verify_backup.py | Evidencia del esquema/filas y restauración aislada |
| docs/openapi.json | 64 rutas consolidadas de las cuatro fases |

No se añadieron modelos gestionados ni tablas de control. Los contadores existentes de login se reutilizan con claves distintas para check-in. La evidencia provisional, resoluciones y revisión se guardan en auditoria; no se inventan campos SQL.

## Crear, imprimir y revocar un QR

1. Iniciar sesión administrativa usando el flujo CSRF de fase 1.
2. POST /api/admin/checkin/puntos/ con {"nombre":"Recepcion","activo":true}.
3. Conservar el ID de la respuesta; el token lo genera PostgreSQL.
4. GET /api/admin/checkin/puntos/{id}/qr/ devuelve el enlace.
5. Abrir la misma ruta con ?formato=svg para impresión nítida o png para descargar. Imprimir con margen blanco completo; no recortar el QR.
6. Probar el enlace desde un dispositivo de la misma red al disponer de URL accesible; 127.0.0.1 en el teléfono apunta al teléfono, no al ordenador.
7. Para revocar: PATCH activo=false. Si se filtró, crear un punto nuevo y sustituir el cartel. No reactivar el anterior si se busca una rotación efectiva.

El enlace local actual apunta al endpoint JSON de pruebas, no a una pantalla Angular terminada. PUBLIC_CHECKIN_URL se cambia al formulario Angular cuando exista. No se insertó un punto/cartel ficticio en Lasheo durante las pruebas; se generan mediante la API administrativa cuando se decida usarlos.

## Configuración local acordada

```dotenv
PUBLIC_CHECKIN_URL=http://127.0.0.1:8000/api/public/checkin/
CHECKIN_PUBLIC_NAME=Lasheo
CHECKIN_DEMO_MODE=True
CHECKIN_PRIVACY_NOTICE_URL=http://127.0.0.1:8000/api/public/checkin/aviso-prueba/
CHECKIN_PRIVACY_NOTICE_VERSION=PRUEBA-LOCAL-v1
CHECKIN_PENDING_TTL_MINUTES=90
CHECKIN_APPOINTMENT_WINDOW_MINUTES=120
CHECKIN_POST_IP_LIMIT=15
CHECKIN_GET_IP_LIMIT=60
CHECKIN_IP_DAY_LIMIT=200
CHECKIN_PHONE_LIMIT=6
```

DEBUG local se controla con DJANGO_DEBUG=True. Modo demo se bloquea con DEBUG=False. El aviso de prueba devuelve texto explícito de datos ficticios y consentimiento no preseleccionado. No afecta las variables de aviso real pendientes de fase 1.

En producción futura: CHECKIN_DEMO_MODE=False, formulario y aviso HTTPS reales, versión revisada, hosts/CORS/CSRF exactos, HTTPS/proxy y base con rol mínimo. check --deploy detecta la configuración local ficticia como bloqueo intencional; una simulación HTTPS de ejemplo no equivale a validar URLs, aviso ni despliegue real.

## Angular y recepción

El frontend obtiene configuración mínima con GET público. El formulario puede ofrecer datos de alta opcionales sin consultar si existe el teléfono; nunca se hace lookup público de personas. La casilla de consentimiento no se marca inicialmente. POST devuelve mensaje genérico y se indica acercarse a recepción.

El personal consulta la bandeja, verifica presencialmente y confirma con identidad_verificada=true. Para alta provisional también consentimiento_verificado=true y declaración de aviso vigente. Solo después se puede crear o asociar visita.

El personal puede revisar citas sugeridas y enlazar una de forma explícita. Las visitas no generan venta ni saldo recaudado. No existe un dashboard que las sume a ingresos; las pruebas verifican que ventas/pagos/consumos/movimientos no cambian.

El job expire_checkins cancela pendientes viejas conservando auditoría. Debe programarse en despliegue o ejecutarse mediante la acción privada; no se creó una tarea del sistema operativo.

## Comandos reproducibles

```powershell
.\.venv\Scripts\python.exe -X utf8 -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe manage.py check --database default
.\.venv\Scripts\python.exe manage.py test apps.autenticacion apps.clientas apps.catalogo apps.inventario apps.checkin tests --noinput
.\.venv\Scripts\python.exe scripts/phase4_snapshot.py
.\.venv\Scripts\python.exe scripts/verify_backup.py --phase 4
.\.venv\Scripts\python.exe scripts/update_checkin_openapi.py
.\.venv\Scripts\python.exe manage.py expire_checkins --limit 200
.\.venv\Scripts\python.exe manage.py runserver
```

El snapshot es evidencia del estado durante esta implementación, no un impedimento para operaciones legítimas posteriores. No volver a capturarlo encima del baseline. Las pruebas usan exclusivamente bases aleatorias con el esquema versionado, sin producción.

## ADR: compatibilidad sin migraciones

Se eligieron auditoría existente para declaración/revisión y resolución, contadores PostgreSQL existentes para abuso, y CANCELADA para vencimiento. Esto permite toda la fase sin DDL.

Límites residuales: no hay prueba automática de identidad/presencia, archivo verificable de consentimiento, expiry nativo, teléfono canónico indexado ni dispositivo acreditado. Una necesidad futura de esas garantías exige diseño/retención y una migración separada revisada y autorizada; no se ejecutó ni se inventó ninguna ahora. Los marcadores de auditoría del flujo provisional no deben borrarse arbitrariamente.

Para alta concurrencia, el bloqueo corto compartido con clientas y el recorrido de formatos telefónicos heredados requieren medición; se verificaron concurrencia funcional y ausencia de N+1, no carga masiva. Revisión legal, retención, proxy/rate limit de borde, disponibilidad del formulario y cartelería real quedan para operar con datos reales.

Referencias: [Segno](https://segno.readthedocs.io/en/latest/), [CSRF Django](https://docs.djangoproject.com/en/5.2/ref/csrf/), [checks Django](https://docs.djangoproject.com/en/5.2/ref/checks/).

