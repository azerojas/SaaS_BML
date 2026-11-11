# ADR-010 — Ledger de reembolsos, ajustes y conciliaciones

Propuesta aditiva previa a la activación: tres tablas nuevas finanzas_reembolso, finanzas_ajusteventa y finanzas_conciliacion. No cambiar tablas, vistas, funciones ni filas históricas. Ensayar primero en PostgreSQL aislado; antes de activar en Lasheo local crear respaldo nuevo, restaurarlo y comparar los originales. La autorización actual es resolver seis controles localmente; no publicar ni contratar servicios.

Pagos/anticipos existentes no permiten registrar salida de dinero ni evidencia de cierre. ANULADO corrige un registro y no representa reembolso. Reembolso nuevo referencia exactamente un pago/anticipo confirmado mediante FK; monto Decimal positivo; suma no supera fuente. Para anticipo, solo devolver parte no aplicada de cita terminal. Para pago, devolución reduce cobertura y reabre saldo si no hay ajuste comercial; no modifica venta original ni stock.

Ajuste comercial reduce importe exigible de venta confirmada, hasta total sin propina. Solo hasta saldo descubierto: devolver dinero primero y después ajustar; nunca sobrecobertura. No cambia snapshots ni costos históricos, ni equivale a nota tributaria. Una devolución física requiere revisión y movimiento de stock separado; no inferirla de un reembolso.

Conciliación manual por día Lima y medio: pagos confirmados + anticipos confirmados (incluidos los de citas terminales) − reembolsos. No sumar aplicaciones. Capturar hash de fuentes, monto observado y SHA256 de evidencia; exigir igualdad exacta. Revisiones inmutables; cambios tardíos invalidan cierre previo hasta nueva revisión. Caja de establecimiento, no inventar atribución por profesional/servicio.

Escrituras con transaction.atomic, locks financieros existentes, Idempotency-Key y permisos específicos refund_payment/adjust_sale/reconcile_cash. Sin PATCH/DELETE del ledger; runtime DB sin UPDATE/DELETE de esas tablas. No otorgar permisos automáticamente a empleados. La conciliación humana no es integración bancaria automática ni contabilidad fiscal.

Reversión: desactivar endpoints y conservar tablas/historia; no borrar devoluciones/cierres ni usar código previo para cobrar ignorando ajustes. Detener escrituras y volver a versión compatible, o restaurar únicamente en servidor nuevo bajo responsable. Snapshot privado de fuentes previo creado. Los casos legacy ambiguos permanecen bloqueados para revisión, sin reescribir importes reales.
