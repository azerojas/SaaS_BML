# Pruebas y demostración

```powershell
.\.venv\Scripts\python.exe -X utf8 -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe manage.py test apps.autenticacion apps.clientas apps.catalogo apps.inventario apps.checkin tests --noinput
```

Se usa el runner existente de PostgreSQL aislado, con el DDL original sin datos. Los tests no escriben clientas, puntos, llegadas o visitas en Lasheo. No usar --keepdb ni --parallel.

Cobertura:

- [x] QR UUID de PostgreSQL, edición privada, formatos JSON/SVG/PNG y revocación.
- [x] Lectura del PNG generado con decodificador independiente zxing-cpp; contenido solo URL/token.
- [x] Público sin PII/IDs de personas; misma respuesta para existente/desconocida/inactiva/duplicada.
- [x] Teléfonos normalizados y ambigüedad heredada sin selección arbitraria.
- [x] Alta nueva requiere datos mínimos, booleano explícito y aviso vigente; ficha provisional inactiva.
- [x] Público no modifica nombres/notas/consentimiento de fichas existentes.
- [x] MIME, payload, campos desconocidos, errores sin reflejar valores y modo demo bloqueado en producción.
- [x] Rate compartido por IP y teléfono; X-Forwarded-For y formatos telefónicos no lo evitan.
- [x] Token QR no autentica administración; anónimos/no staff bloqueados; CSRF obligatorio privado y válido permite escritura.
- [x] Bandeja privada con filtros/paginación/orden y sin N+1 en 21 llegadas.
- [x] Confirmación humana, revisión de consentimiento, cambio de versión, rechazo/cancelación y transiciones duplicadas.
- [x] Vencimiento hacia CANCELADA y auditoría de actor sistema/administrador, sin borrar.
- [x] Visita única por llegada e igualdad de clienta; asociación de visita existente y rechazo de ficha incompatible.
- [x] Sugerencias privadas de citas y enlace explícito compatible sin cambiar pagos/estado de cita.
- [x] Rollback de confirmación también revierte activación y consentimiento.
- [x] No se crean ventas, pagos, consumos ni movimientos de inventario.
- [x] Concurrencia real: solicitudes simultáneas, dos puntos, confirmar vs rechazar, dos visitas, asociar vs crear y contadores compartidos.
- [x] Regla pura de vigencia en el límite temporal y chequeos de configuración.
- [x] Regresión de fases anteriores y verificación de rutas/referencias OpenAPI.

La demostración consiste en crear punto y propuesta ficticios en la base temporal, confirmar identidad/consentimiento, crear una sola visita ABIERTA y comprobar cero efectos financieros. No se sembró un QR de recepción en la base real.

Segno es dependencia de ejecución. zxing-cpp es dependencia de desarrollo, solo para verificar lectura real del PNG; no se requiere en el servidor de producción. El resultado consolidado se registra en docs/resultado-fase4.md.

