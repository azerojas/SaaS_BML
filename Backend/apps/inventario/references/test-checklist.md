# Verificación de inventario, fase 3

Ejecutar desde Backend:

```powershell
.\.venv\Scripts\python.exe manage.py test apps.autenticacion apps.clientas apps.catalogo apps.inventario tests --noinput
```

Usa el runner PostgreSQL aislado de fase 1, con esquema completo sin datos antes de migrar. Todas las escrituras de prueba y la demostración ocurren en bases temporales. No usar --parallel ni --keepdb; el runner los rechaza.

Cobertura implementada:

- [x] Proveedor: validación, edición, baja/reactivación, RUC sin unicidad artificial e historial conservado.
- [x] Borrador vacío permitido; recepción vacía bloqueada.
- [x] Total Decimal calculado, redondeo final HALF_UP y rechazo de float/números JSON.
- [x] Precisión, límites monetarios y de existencias, unidad confirmada y referencias válidas.
- [x] Edición de detalles solo en BORRADOR; rechazo de total/estado/actor aportados.
- [x] Recepción con un movimiento positivo por línea y stock exacto.
- [x] Reintentos sin duplicación; recepción ya confirmada conserva idempotencia tras desactivaciones.
- [x] Rollback completo después de insertar el primer movimiento y antes de completar recepción.
- [x] Índice único parcial uq_mov_compra y fuentes recibidas inconsistentes.
- [x] Ajustes con motivo, tipo permitido, signo de servidor, clave obligatoria y saldo.
- [x] Reintento de ajuste conserva el saldo original pese a movimientos posteriores; otra carga da 409.
- [x] Auditoría de ajustes transaccional, sin justificaciones completas en JSON.
- [x] Salida insuficiente bloqueada y ledger sin endpoints de edición/borrado.
- [x] Stock de vista coincide con suma; bajo mínimo incluye igualdad; sin movimientos.
- [x] Costos ponderados de compras recibidas; costo desconocido null y compra gratuita cero válido.
- [x] Receta incompleta no inventa total; borradores y ajustes excluidos del costo histórico.
- [x] Vencimientos solo de compras recibidas y sin saldo por lote inventado.
- [x] Fechas America/Lima, filtros, orden, paginación y consultas acotadas en listados.
- [x] Todas las rutas bloquean anónimos/no staff y escrituras sin CSRF.
- [x] Sesión con CSRF válido, IDs inválidos y OPTIONS autenticado.
- [x] Concurrencia real: misma recepción, misma clave de ajuste, dos salidas, compras con artículos en orden opuesto, recepción vs salida y cambio de unidad de catálogo vs ajuste.
- [x] Demostración aislada completa: proveedor → borrador → recibir → stock → ajuste → alerta.
- [x] Regresión de fases 1 y 2 incluida en suite consolidada.

Los tests concurrentes usan conexiones independientes a la base aleatoria y bloqueo de fila de artículo, con timeout de bloqueo en las conexiones de prueba. Las limpiezas verifican que se ejecutan en una base test_lasheo_phase1_*. No hay datos de negocio de demostración sembrados en Lasheo.

Los archivos references mencionados por la skill adjunta no venían en Downloads/references; esta lista y api-contract.md materializan el contrato y checklist a partir del contenido completo de la skill y del esquema inspeccionado.

El resultado exacto del último pase consolidado está en docs/resultado-fase3.md. No se declara producción validada, política FIFO, lotes con saldo ni costo contable de salidas.

