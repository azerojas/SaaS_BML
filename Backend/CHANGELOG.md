# Cambios

## 1.6.0 — Fase 7, revisión de cierre 9 de noviembre de 2026

- Agenda privada por capas: profesionales/especialidades, horarios, bloqueos, citas y lista de espera.
- Disponibilidad conservadora y revalidación atómica con EXCLUDE, locks compartidos e idempotencia persistente.
- Anticipos integrados con Fase5, expiración explícita, reprogramación con snapshots y enlace QR sin duplicar cobros.
- Tres consultas públicas limitadas de solo lectura, permisos por acción, CSRF y protección de datos personales.
- Proxy para diez permisos, sin nuevas tablas ni cambios de vistas; activado con autorización el 10 de noviembre de 2026, con esquema y filas originales preservados y consultas privadas HTTP 200.
- OpenAPI1.6.0 y 314 pruebas aprobadas en PostgreSQL aislado; scheduler y escritura pública verificada pendientes de fases operativas.

## 1.5.0 — 6 de noviembre de 2026

- Dashboard financiero, series en Lima, comparación mensual, rankings y estadísticas de inventario/gastos/clientas.
- Decimal y reglas de Fase 5; separación de devengado, cobros, anticipos, costo real, comisión, margen y utilidad operativa estimada.
- Snapshots PostgreSQL REPEATABLE READ READ ONLY, límites de consulta/volumen y errores controlados, sin N+1.
- Excel openpyxl con mismos servicios de cálculo, celdas de texto literales, permisos mínimos, límites y auditoría de acceso.
- Modelo proxy para cuatro permisos propios, sin tablas nuevas ni cambios a las siete vistas; activación autorizada y verificada en Lasheo con esquema/filas originales preservados.
- Recaudación neta bloqueada hasta disponer de reembolsos/conciliación verificables; no se certifica utilidad contable ni cierre histórico.

## 1.4.0 — 6 de noviembre de 2026

- Módulo financiero por capas: visitas, borradores, servicios/productos, consumo real y snapshots históricos.
- Confirmación atómica integrada con inventario; cantidades agregadas y protección de stock y fuentes únicas.
- Pagos parciales/manuales, saldo y aplicaciones de anticipos sin duplicar caja; permisos por acción.
- Idempotencia persistente y aplicaciones parciales mediante dos tablas aditivas; migración autorizada y aplicada en Lasheo con respaldo y preservación verificada del esquema/datos originales.
- Anulaciones de error separadas de reembolsos; compensaciones de operaciones confirmadas bloqueadas y documentadas.
- OpenAPI 1.4.0, ejemplos verificados y regresión en PostgreSQL aislado.

## 1.3.0 — 6 de noviembre de 2026

- Puntos QR revocables, UUID de PostgreSQL y generación local SVG/PNG sin datos personales.
- Check-in público no enumerativo con límites PostgreSQL compartidos y fichas nuevas provisionales.
- Bandeja privada, revisión presencial, consentimiento verificado y resoluciones auditadas.
- Vencimiento hacia CANCELADA, visita única y enlace explícito con atención/cita compatible; sin cobros.
- Corrección del ForeignKey histórico de llegadas y defaults existentes, sin DDL ni migraciones.
- Modo de datos ficticios autorizado, aviso local y bloqueo de demo en producción.
- Regresión PostgreSQL, concurrencia, lectura QR independiente y contrato consolidado.

## 1.2.0 — 6 de noviembre de 2026

- Proveedores y compras BORRADOR, recepción idempotente y anulación controlada.
- Kardex inmutable, stock de vista y ajustes cuantitativos con clave de idempotencia.
- Bloqueos de artículos por ID para impedir salidas sin stock y carreras con catálogo.
- Estimados históricos ponderados de compras recibidas, alertas de bajo stock y fechas observadas sin inventar saldos por lote.
- Precisión Decimal obligatoria por cadenas JSON y totales de servidor, sin IGV implícito.
- Auditoría atómica, pruebas de PostgreSQL y contrato OpenAPI 1.2.0; sin migraciones físicas ni datos de demostración en Lasheo.

## 1.1.0 — 6 de noviembre de 2026

- Catálogo administrativo: categorías, unidades, servicios, insumos y productos.
- Catálogo público de solo lectura desde vistas existentes, con DTO sin datos internos.
- Recetas estimadas, referencias de imágenes y principal transaccional.
- Stock orientativo privado; sin compras, ventas ni movimientos automáticos.
- Mapeo de imágenes corregido para varias referencias por entidad; defaults reales y vistas unmanaged.
- Validaciones cruzadas, auditoría y pruebas de PostgreSQL incluidas las concurrentes.
- Contrato OpenAPI consolidado y guía Angular. Sin migraciones físicas ni datos de negocio de ejemplo en Lasheo.

## 1.0.0 — 6 de noviembre de 2026

- Conexión PostgreSQL, modelos heredados y relaciones a usuarios.
- Autenticación administrativa con CSRF y gestión privada de clientas.
- Pruebas aisladas, respaldo restaurado y documentación.

