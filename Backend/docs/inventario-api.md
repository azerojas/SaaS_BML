# Lasheo — fase 3: inventario y compras

Contrato completo con rutas y ejemplos: [api-contract.md](../apps/inventario/references/api-contract.md).
Pruebas y reproducción: [test-checklist.md](../apps/inventario/references/test-checklist.md).
OpenAPI consolidado: [openapi.json](openapi.json), versión 1.2.0.

## Diagnóstico inicial

| Comprobación | Resultado |
|---|---|
| Fases 1 y 2 | 79 pruebas ejecutadas y aprobadas antes de implementar inventario |
| Entorno | Python 3.14.2, Django 5.2.19, DRF 3.18.3, psycopg 3.3.8 y PostgreSQL 18.3 |
| Esquema | 34 tablas de negocio, 11 internas y 7 vistas |
| Modelos canónicos | Proveedores, Compras, DetallesCompra, Articulos, UnidadesMedida, MovimientosInventario, RecetasServicio; todos managed=False |
| Usuario estándar | Mantenido; 13 FK a auth_user restauradas siguen activas |
| Compras | BORRADOR/RECIBIDA/ANULADA, total NUMERIC(12,2), proveedor nullable |
| Detalles | Cantidad NUMERIC(14,3), costo NUMERIC(12,4), lote y vencimiento opcionales |
| Ledger | CHECK de signo, referencias RESTRICT e índice parcial único uq_mov_compra |
| Triggers | El trigger de actualizado_en de artículos se conserva; compras y movimientos no requieren señal nueva |
| Estado inicial de negocio | Sin proveedores, compras ni movimientos cargados; 5 unidades originales conservadas |
| Git | La carpeta sigue sin repositorio Git; no se inicializó ni se sobrescribieron cambios del usuario |

Defaults no reflejados por inspectdb se mapearon en Python mediante db_default: proveedor activo; compra fecha/estado/total; movimiento fecha/costo. No se ejecutó DDL, makemigrations ni migrate. El snapshot original de pruebas no se modificó y las 34 tablas/7 vistas no se recrearon.

Antes de implementar se capturó un backup completo y las huellas del esquema y de todas las filas de negocio. El respaldo de fase 3 se restauró en una base temporal y comprobó 45 tablas físicas y 7 vistas. La verificación final compara el mismo esquema y las mismas filas de las 34 tablas de negocio.

## Arquitectura y archivos

| Archivo/directorio | Responsabilidad |
|---|---|
| apps/inventario/api/serializers.py | Entradas estrictas, cadenas decimales y DTO privados |
| apps/inventario/api/views.py y urls.py | HTTP, sesión/CSRF, permisos y paginación |
| apps/inventario/services.py | Proveedores, borradores, recepción, anulación, ajustes y auditoría atómicos |
| apps/inventario/selectors.py | Consultas parametrizadas, stock, kardex, alertas y estimados |
| apps/inventario/domain/politicas.py | Precisión, máximos, redondeo y promedio histórico |
| apps/inventario/tests/ | API, dominio, rollback, integridad y concurrencia PostgreSQL |
| negocio/models.py | Mapeo de defaults existentes sin cambiar managed=False |
| config/settings.py y urls.py | Registro del módulo y rutas privadas |
| scripts/update_inventory_openapi.py | Contrato consolidado; reutiliza mapeo de DTO de catálogo |
| scripts/phase3_snapshot.py | Captura inicial y comprobación de esquema/filas reales |
| scripts/verify_backup.py | Restauración aislada por fase, --phase 3 |
| apps/catalogo/views.py | Serializer de metadata para corregir OPTIONS autenticado de imágenes |
| scripts/update_catalog_openapi.py | Conserva versión/descripción de fase 3 al regenerar catálogo |

Se conservan IsAdminUser, autenticación por sesión y errores code/detail/errors de fases previas. No se inventaron grupos ni permisos inventario.* que no existían. No se integraron señales, tokens nuevos ni endpoints públicos de costos.

## Protocolo transaccional

Recepción: atomic → compra SELECT FOR UPDATE → detalles → proveedor activo si existe → artículos SELECT FOR UPDATE ordenados por ID → lectura de stock → comprobaciones → un movimiento por detalle → estado RECIBIDA y total recalculado → auditoría → commit.

Edición de borradores también bloquea compra, proveedor y artículos antes de escribir detalles. La fase 2 bloquea artículos al cambiar su unidad o receta; eso impide que se cruce una modificación de unidad con la creación de cantidades históricas. Las compras no convierten empaques automáticamente.

Ajuste: atomic → bloqueo advisory por cuenta/clave → consulta de idempotencia → artículo SELECT FOR UPDATE → SUM del ledger → validación de saldo → movimiento y auditoría → commit. Dos salidas no pueden usar el mismo saldo. Se respetan los bloqueos también al recibir. No se tomó un bloqueo global que serialice todos los productos del inventario.

El estado de idempotencia de ajustes se guarda atómicamente en auditoria, no en una caché de proceso. No eliminar esos eventos para mantener reintentos. El índice uq_mov_compra respalda las fuentes de compra; los bloqueos previenen carreras API y se comprueba que una compra RECIBIDA tiene exactamente los movimientos esperados. Inconsistencias heredadas se bloquean, no se reparan borrando historial.

Este protocolo cubre los servicios de aplicación. Escritores SQL externos que omitan bloqueos o editen ledger pueden invalidar garantías; una protección física adicional requeriría una migración explícitamente aprobada.

## Valorización y alcance

El promedio de compras recibidas es una consulta histórica, no un libro de costo promedio móvil. No hay FIFO, saldo por lote, margen real ni valorización contable de ajustes/salidas. Los ajustes tienen valoracion=NO_VALORIZADO y cero técnico en el campo obligatorio del ledger; los costos estimados desconocidos siguen siendo null.

La consulta explícita de costo de receta es nueva; el contrato de receta de catálogo permanece igual. Cambiar precios no altera snapshots anteriores. No hay ventas, pagos, QR, citas ni consumos de tratamientos en esta fase.

No existe devolución a proveedor: el CHECK heredado de DEVOLUCION solo admite una entrada positiva. Las correcciones de cantidades se hacen con nuevos ajustes justificados, sin editar el ledger. Las alertas de vencimiento no prometen disponibilidad de ese lote.

## Ejecución en PowerShell

Desde Backend:

```powershell
.\.venv\Scripts\python.exe manage.py check --database default
.\.venv\Scripts\python.exe manage.py test apps.autenticacion apps.clientas apps.catalogo apps.inventario tests --noinput
.\.venv\Scripts\python.exe scripts/phase3_snapshot.py
.\.venv\Scripts\python.exe scripts/verify_backup.py --phase 3
.\.venv\Scripts\python.exe scripts/update_inventory_openapi.py
.\.venv\Scripts\python.exe manage.py runserver
```

El snapshot es la evidencia de esta implementación. Después de comenzar a registrar operaciones reales cambiarán legítimamente sus huellas; no debe usarse para impedir operaciones normales ni regenerarse encima del baseline original. Su opción --capture se utilizó una sola vez y rechaza sobrescritura.

No hay dependencias nuevas ni variables de entorno obligatorias nuevas. Se mantienen DB/SECRET_KEY, hosts, CORS/CSRF y DJANGO_DEBUG. La cuenta ficticia existente conserva sus credenciales; no se guardan en esta documentación. Ninguna prueba de escritura se ejecuta sobre Lasheo.

## Pendientes y límites operativos

- La metodología contable de costo de salida/consumo, devoluciones a proveedor y saldo por lote requieren diseño posterior; no se implementaron de forma implícita.
- Los ajustes pueden corregir cantidades, pero los no valorizados necesitan política futura antes de reportes financieros.
- La creación de borradores no tiene idempotencia de cabecera; Angular conserva su ID y reintenta recepción con él.
- Se rechazó recibir artículos ya vencidos; pueden mantenerse en borrador para revisión o anulación.
- Una API sin ledger editable no equivale a un rol SQL sin permisos de UPDATE/DELETE; configurar mínimos privilegios y respaldos externos antes del despliegue.
- No hay prueba de carga ni despliegue validado. HTTPS, proxy, límites de peticiones y almacenamiento seguro de backups siguen en infraestructura futura.
- Las fotos y dominios aprobados de fase 2 y el aviso real de privacidad de fase 1 siguen pendientes; no cambian el inventario.
- No se implementó Angular ni WhatsApp.

Referencias: [transacciones Django](https://docs.djangoproject.com/en/5.2/topics/db/transactions/), [SELECT FOR UPDATE](https://docs.djangoproject.com/en/5.2/ref/models/querysets/#select-for-update), [bloqueos PostgreSQL](https://www.postgresql.org/docs/18/explicit-locking.html).

