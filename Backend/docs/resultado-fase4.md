# Resultado de fase 4 — check-in QR

Fecha: 6 de noviembre de 2026, America/Lima.

| Evidencia ejecutada | Resultado |
|---|---|
| Regresión inicial de fases 1–3 | 122 pruebas aprobadas |
| Suite consolidada final | 165 pruebas aprobadas, 23.526 segundos de ejecución de tests |
| Pruebas nuevas de check-in | 43, incluidas 6 de concurrencia PostgreSQL real |
| Lectura de QR | PNG generado por Segno decodificado correctamente con zxing-cpp independiente; solo URL/token |
| check --database default | Sin errores |
| migrate --check | Sin migraciones pendientes |
| pip check y compileall | Sin conflictos ni errores de sintaxis |
| check --deploy local | Bloqueo intencional checkin.E001/E002: aviso ficticio y URLs HTTP |
| Simulación de configuración HTTPS, demo False, DEBUG False | check --deploy --fail-level WARNING sin advertencias; URLs de ejemplo, sin despliegue |
| OpenAPI | 1.3.0, 64 rutas; referencias y resolución verificadas en la suite |
| Respaldo completo previo | Restaurado en base temporal: 45 tablas físicas y 7 vistas |
| Base Lasheo al finalizar | Esquema completo y filas de las 34 tablas de negocio idénticos al baseline |
| HTTP real | Aviso de prueba 200; puntos/QR/bandeja privados 403 anónimo; punto desconocido 404; catálogo y login administrativo disponibles |

El servidor se reinició para cargar la fase 4 en http://127.0.0.1:8000/. Se conserva la cuenta de prueba existente. No se insertaron clientas, puntos, llegadas ni visitas de demostración en Lasheo. Las peticiones públicas reales solo actualizaron los contadores HMAC existentes de control de abuso, sin PII en texto.

## Demostración y garantías comprobadas

En la base PostgreSQL aislada se creó un punto QR, se solicitó un alta ficticia y se verificó que permanecía inactiva, con consentimiento no verificado y llegada PENDIENTE. Antes de confirmación no pudo crear visita. La administradora verificó identidad/consentimiento y se creó una sola visita ABIERTA; repetir devolvió la misma visita. No se crearon ventas, pagos, consumos ni movimientos.

Las pruebas públicas compararon respuestas de teléfono existente, desconocido, inactivo y duplicado sin devolver identidad/existencia. Se probaron MIME/payload, campos sensibles, colisión UNIQUE sin filtración, límites compartidos, token QR sin acceso administrativo y modo demo rechazado en producción.

Las pruebas privadas comprobaron permisos/CSRF, búsquedas/paginación/orden, máximo una pendiente global, historial con varias llegadas, transición duplicada rechazada, expiración hacia CANCELADA con actor/sello temporal, asociación de visita de la misma clienta y sugerencia/enlace explícito de cita sin dinero.

La concurrencia verificó solicitudes sobre el mismo teléfono, dos puntos distintos, confirmar contra rechazar, dos creaciones de visita, asociación contra creación y contadores compartidos. La bandeja con 21 registros se mantuvo dentro de un presupuesto de 3 consultas; no es prueba de carga.

## Alcance y pendientes reales

La fase funciona en el modo de datos ficticios y aviso local elegido por el usuario. No se validó ni publicó un aviso legal real, formulario Angular, dominio, proxy, cartel físico o despliegue. El enlace local abre la API JSON; la pantalla Angular completa está fuera de esta fase.

El QR no verifica identidad ni presencia. No hay prueba por dispositivo, OTP ni mensajería externa. Los futuros datos reales requieren aviso revisado, HTTPS y controles operativos. El vencimiento tiene comando/acción privada comprobados; la programación periódica corresponde al despliegue.

No se ejecutaron migraciones ni se alteraron las 34 tablas/7 vistas. Se conservan managed=False y las 13 FK de usuarios. No quedaron pruebas obligatorias pendientes del backend implementado.

Archivos, arquitectura, configuración y operación: [checkin-api.md](checkin-api.md). Detalles de rutas: [api-contract.md](../apps/checkin/references/api-contract.md). Evidencia y checklist: [test-checklist.md](../apps/checkin/references/test-checklist.md).
