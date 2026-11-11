# Auditoría y propuesta aditiva de Fase 5

Revisión del 2026-11-06 sobre código y PostgreSQL instalado: 34 tablas de negocio, 7 vistas, 45 tablas físicas incluyendo infraestructura Django. Las fases 1–4 tienen 165 pruebas previas aprobadas. Autenticación por sesión/CSRF, catálogo/recetas sin costo arbitrario, stock mediante movimientos y locks compartidos, QR no enumerativo con confirmación presencial. Los 13 FK a usuarios ya habían sido restaurados; no hay que volver a crearlos.

Entorno verificado: Python 3.14.2, Django 5.2.19, DRF 3.18.3, psycopg 3.3.8 y PostgreSQL 18.3. Se capturaron respaldo completo y huellas privadas en `backups/phase5-baseline.json`. Los casos financieros, visitas, profesionales y stock de la base real estaban vacíos; no se poblaron para probar.

| Tablas existentes | Uso / relación preservada |
|---|---|
| `clientas`, `llegadas`, `visitas` | Llegada confirmada de misma clienta; UNIQUE llegada por visita |
| `citas`, `anticipos_cita` | Cita/clienta/visita, monto y estado de anticipo; vínculo antiguo a venta preservado |
| `ventas` | Visita UNIQUE nullable; clienta, estado, subtotal, descuento, propina, total |
| `detalles_venta` | Servicio XOR producto; snapshots de descripción/precio/costo/comisión |
| `servicios`, `profesionales`, `recetas_servicio` | Precio/porcentaje y consumo sugerido, nunca consumo automático |
| `articulos`, `unidades_medida`, `compras`, `detalles_compra` | Unidad base y costo ponderado de compras recibidas |
| `consumos_servicio` | Cantidad real y costo histórico por detalle/artículo |
| `movimientos_inventario` | Salidas negativas con UNIQUE por consumo o producto |
| `pagos` | Cobro confirmado/anulado, método, referencia y responsable |
| `auditoria` | Trazabilidad transaccional sin secretos ni teléfono |

Todas siguen administradas por SQL heredado (`managed=False`). Los `db_default` corregidos en Ventas/DetallesVenta/Pagos/Anticipos reflejan valores ya instalados: no son ALTER de sus columnas. Las siete vistas se conservan intactas. No se crean modelos duplicados de negocio.

## Propuesta 0001_finance_support — aprobada y aplicada

El usuario autorizó explícitamente «Sí, aplicar y verificar la activación». Se aplicó después de documentar la propuesta y probarla en aislamiento. Resultado comprobado: 47 tablas y 7 vistas, todas las estructuras y filas de negocio originales preservadas, 9 permisos financieros creados y endpoints de consulta autorizados con respuesta 200. Evidencia privada: `backups/phase5-activation-report.json` y respaldo fresco `*_before_phase5_activation.dump`.

Justificación previa a aplicar: el SQL existente no permite persistir claves de reintento ni asignaciones parciales de anticipos con trazabilidad. Simularlo con `pagos` duplicaría caja; usar solo `venta_id` perdería fracciones. La migración añade únicamente:

1. `idempotency_records`: UUID, actor FK protegido, operación, hash SHA256 del DTO canónico, estado HTTP y resultado mínimo JSON, fecha y expiración nullable. UNIQUE actor/operación/key. Claves permanentes sin reejecución por caducidad; no se guarda la solicitud ni datos personales en respuesta.
2. `aplicaciones_anticipo`: anticipo y venta con FK SQL `ON DELETE RESTRICT`, monto NUMERIC(12,2) CHECK >0, UUID de operación, fecha, autor protegido; UNIQUE anticipo/venta/clave e índices de consulta. Las FK se definen en SQL sobre la tabla nueva porque los modelos unmanaged no forman un estado migrable de esas relaciones.

No añade columnas o restricciones a las tablas originales. La compatibilidad, límites y coincidencia de clienta/cita se validan bajo locks en aplicación. El estado Django crea permisos del módulo. Resultado obtenido tras autorización: **47 tablas físicas, 34 heredadas preservadas, 2 nuevas de soporte y 7 vistas**. La migración es atómica y su reversibilidad se probó exclusivamente en PostgreSQL aislado.

Revisión reproducible: `python scripts/phase5_activation.py` genera `docs/migrations/phase5-additive.sql` sin cambiar la BD. Tras autorización explícita: `python scripts/phase5_activation.py --apply --database-name Lasheo`; obtiene backup fresco, aplica solo esta migración y verifica huellas antes/después de todas las estructuras originales y filas de negocio. Genera informe privado de activación. La disponibilidad del módulo se comprueba por MigrationRecorder; sin aprobación/aplicación responde 503.

No revertir esta migración cuando ya existan claves/aplicaciones: borraría el ledger de soporte aunque mantenga las tablas originales. En caso de fallo posterior a activar, detener escrituras financieras y reparar hacia adelante. Restaurar backup completo solo mediante plan de recuperación revisado, ensayado en otra base, sin superponer dump sobre datos recientes.

## Propuesta futura para compensaciones (no aplicada)

Antes de devoluciones reales, diseñar tabla aditiva `reembolsos` con origen pago o anticipo exclusivo, monto positivo, estado y fecha de confirmación, responsable, motivo, referencia e idempotencia; asignaciones reversadas mediante eventos compensatorios inmutables vinculados al original. Límites bajo lock: acumulado reembolsado no supera cobrado menos aplicaciones vigentes. Devolución de producto necesita ledger de devolución y movimiento de entrada ligado al detalle, cantidad acumulada no superior a vendida y costo histórico original. Un insumo ya utilizado no se repone por anular venta. Requiere acordar destino de propinas, comisión, verificación del dinero saliente y conciliación. No se añadió una tabla parcial sin esas reglas.

Tampoco hay lote preciso, régimen fiscal o comprobantes electrónicos. Esos cambios necesitan diseño aditivo separado. Las vistas `vw_ingresos_diarios`, `vw_margen_lineas`, `vw_comisiones_servicios` no cubren por sí solas asignaciones nuevas, caja de anticipos, descuentos globales y comisión neta; Fase 6 debe ajustarlas bajo aprobación. No usarlas como autoridad de saldo o margen de Fase 5.
