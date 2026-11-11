# ADR-006: reportes sobre esquema instalado

Auditoría real 2026-11-06: 47 tablas físicas, 34 originales de negocio, dos soportes financieros de Fase 5 y tablas Django; siete vistas, 13 FK de usuario restauradas, PEN/America/Lima. Evidencia privada completa de columnas, constraints, índices y SQL de vistas: `backups/phase6-installed-schema.json`. Respaldo previo y huellas: `*_before_phase6.dump`, `phase6-baseline.json`. Se restauró el backup en otra base temporal, verificando 47 tablas/7 vistas y eliminando solo esa base.

Fases 1–5 verificadas por 223 tests previos. Fase 5 usa idempotencia persistente, salidas únicas de producto/consumo, snapshots y comisión tras reparto global. Anticipos se aplican en `aplicaciones_anticipo`, sin crear `pagos`. Pagos se verifican manualmente; la auditoría no es conciliación bancaria.

| Vista existente | Semántica observada y decisión |
|---|---|
| `vw_stock_actual` | Suma movimientos por artículo; bajo_minimo es existencia <= mínimo. Reutilizada directamente con filtro de artículos activos. Foto actual, sin lotes/valorización garantizada. |
| `vw_ingresos_diarios` | Pagos confirmados de ventas confirmadas por día Lima y método. Semántica válida para ese componente; no anticipos ni recaudación neta. Consultas base equivalentes para granularidad y filtros de cohorte sin cambiar vista. |
| `vw_margen_lineas` | Neto de línea y costo, ignora descuento_global y redondea por línea; no usar como margen global definitivo. Recalcular con snapshots/reglas Fase 5. |
| `vw_comisiones_servicios` | Porcentaje sobre línea antes de descuento global. No coincide con regla Fase 5; no usar como autoridad de comisiones. |
| `vw_catalogo_servicios` | Catálogo actual público; no conserva descripción/precio histórico. Solo Fase 2; ranking usa snapshots. |
| `vw_catalogo_articulos` | Catálogo actual y disponibilidad; no demuestra costos históricos ni lotes. No usar como valorización. |
| `vw_agenda_diaria` | Agenda de citas, no visitas atendidas/cobros. No usar citas programadas como ventas o clientas efectivamente atendidas. |

Tablas consultadas: ventas/detalles_venta/consumos_servicio/movimientos_inventario/auditoria para devengado/costos; pagos y anticipos_cita/citas/aplicaciones_anticipo para componentes y cobertura; gastos_operativos/categorias_gasto para gastos por fecha; visitas/clientas para atención; articulos/categorias_articulo y vw_stock_actual para stock. No se hace JOIN de venta con varias colecciones para sumar cabeceras.

CHECK existentes obligan confirmada_en para ventas CONFIRMADA, pagado_en para anticipo CONFIRMADO y cancelada_en para cita CANCELADA. Las pruebas respetan y verifican estos constraints; no se eliminan para crear fixtures inválidos. Se mantienen las UNIQUE de fuentes de inventario, una venta por visita y una visita por llegada.

## Cambio aditivo aprobado y aplicado: permisos sin DDL de negocio

`apps/reporting/models.py` declara un **proxy** de IdempotencyRecord para registrar permisos propios sin otra tabla de soporte. `reporting.0001_report_permissions` depende del soporte financiero existente; SQL de migración no-op. `post_migrate` crea content type del proxy y permisos `view_summary`, `view_clients`, `view_inventory`, `export`, además del registro en django_migrations. Ninguna columna, índice, función, trigger, vista o fila de negocio debe cambiar.

La activación real se realizó después de la respuesta explícita «Sí, activar permisos y verificar los endpoints». Se registraron cuatro permisos, sin cambios a las 47 tablas, siete vistas o filas de negocio; informe privado `backups/phase6-activation-report.json`. Las nueve consultas autenticadas devolvieron200; no se generaron exportaciones de negocio reales durante la verificación. El script de revisión genera `docs/migrations/phase6-permissions.sql`; el modo apply exige el nombre exacto de la base revisada y compara las huellas antes/después. Se probó retirar/reponer estado en PostgreSQL aislado sin afectar tablas/vistas. No ejecutar migrate general ni recrear negocio. No eliminar la tabla padre al revertir un proxy; desactivar permisos no elimina el historial de idempotencia.

## Brechas y propuesta futura no aplicada

Para `dinero_recaudado` neto faltan eventos inmutables de entrada/salida, reembolsos vinculados al origen, conciliación con comprobación bancaria y trazabilidad de anulación contable. Propuesta futura: `movimientos_financieros` con origen exclusivo pago/anticipo/reembolso, signo/tipo, moneda, fecha efectiva, responsable y clave única; `reembolsos` con origen, monto, estado y límites bajo lock; enlace explícito para importaciones que ya duplicaron anticipos dentro de pagos. Debe migrar/conciliar historia sin inferirla de estados actuales y ser revisada/autorizada antes de aplicar. No se crea un ledger parcial para habilitar artificialmente el KPI.

No hay evidencia de lentitud para añadir índices: se usan los actuales `idx_ventas_confirmadas_fecha`, `idx_pagos_fecha_estado`, `idx_visitas_clienta_fecha`, `idx_movimientos_articulo_fecha`, `idx_gastos_fecha` y FK. EXPLAIN ANALYZE/BUFFERS se ejecuta solo sobre datos ficticios en test. No se altera ninguna vista ni índice en Lasheo durante esta fase.
