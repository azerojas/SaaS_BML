# Diagnóstico y entrega de fase 1

Fecha: 6 de noviembre de 2026 (America/Lima).

| Comprobación inicial | Hallazgo | Resultado |
|---|---|---|
| Django / Python | 5.2.19 / 3.14.2 | Entorno existente usado |
| DRF / psycopg | 3.18.3 / 3.3.8 | Sin dependencias adicionales |
| PostgreSQL | 18.3, base Lasheo | Conexión confirmada |
| Esquema original | 34 tablas, 7 vistas, 45 FK de negocio | Preservado |
| Modelos | negocio/models.py vacío | 34 modelos unmanaged importados |
| auth_user y django_migrations | Ausentes | Creados por migraciones estándar |
| Relaciones a usuarios | 13 columnas INTEGER, sin referencias cargadas | 13 FK verificadas y restauradas |
| clientas | Identity BIGINT, UNIQUE teléfono, CHECK consentimiento, trigger actualizado | Mapeados y probados |
| Defaults SQL | Recordatorios true / canal WHATSAPP | Conservados; API usa false / EMAIL |
| Auditoría | usuario INTEGER nullable, JSONB, TIMESTAMPTZ | Escrituras atómicas sin valores personales |
| Configuración | Secreto en settings y variable Windows DEBUG=release | Secreto local aleatorio en .env, DJANGO_DEBUG independiente |

La importación de inspectdb se revisó: PK compuesta en ProfesionalServicios, relaciones físicas y nombres conservados, usuarios enlazados al modelo estándar. Las vistas se conservan en SQL, sin modelos de escritura. Las aplicaciones canónicas son negocio, apps.autenticacion, apps.clientas y apps.integracion.

Se ensayó la restauración completa del backup previo en una base temporal. El runner de pruebas carga el esquema original sin datos en una base distinta y aplica las migraciones allí. La aplicación a Lasheo conservó conteos de filas y huellas de columnas, funciones, vistas, triggers, índices y restricciones previas. Se añadieron solo tablas internas y los FK revisados.

Limitaciones: aviso de privacidad pendiente de definición; flujo de consentimiento exige configurarlo. La evidencia/versión se conserva en auditoría, no en columnas nuevas. Normalización fonética/Unicode más amplia y unicidad física de teléfonos canónicos frente a escritores externos requieren diseño posterior. Rate limit por REMOTE_ADDR debe adaptarse al proxy al desplegar. Datos de prueba únicamente para esta fase.

Los detalles operativos y contratos están en README.md y openapi.json.

Verificación final: 38 pruebas automatizadas aprobadas en PostgreSQL aislado, check --database default sin errores, pip check sin conflictos y check --deploy --fail-level WARNING sin advertencias usando DJANGO_DEBUG=False. En configuración local HTTP hay cinco advertencias esperadas, documentadas en README.

Se creó admin_prueba con correo ficticio example.com. La comprobación HTTP real en 127.0.0.1:8000 verificó panel de login, inicialización CSRF, login, me, listado privado, política sin caché y logout. No se insertaron registros de negocio en Lasheo durante esas comprobaciones; las altas de clientas se probaron en bases temporales.

