# Matriz de indicadores y conciliación

Moneda PEN, America/Lima; `hasta` exclusiva. Importes Decimal; ROUND_HALF_UP a 2 al presentar, cantidades3/costos4. Reparto de descuento global y comisiones idénticos a Fase 5, con orden estable por ID. Se conserva el costo exacto intermedio antes de redondear agregados.

| KPI | Fuente / fecha | Fórmula, exclusiones y calidad |
|---|---|---|
| ventas_confirmadas | ventas CONFIRMADA / confirmada_en | SUM total cabecera una sola vez; incluye propina. No borrador/anulada. |
| ingreso_por_servicios/productos | detalles confirmados / fecha venta | SUM ROUND_HALF_UP(cantidad×precio−descuento_linea,2) − global asignado por mayores restos. Propina excluida. Null si cabecera no concilia. |
| ingreso_operativo | líneas anteriores | Servicios+productos tras descuentos, sin propina/impuestos adicionales. |
| cobros_registrados | pagos CONFIRMADO + venta CONFIRMADA / pagado_en | SUM monto. No anticipos, pagos anulados o venta anulada; fecha independiente de confirmación de venta. |
| anticipos_recibidos | anticipos CONFIRMADO / pagado_en | SUM monto de citas no terminales; excluir cita CANCELADA/EXPIRADA/NO_ASISTIO con aviso de posible dinero retenido, sin inventar devolución. |
| dinero_recaudado | Ledger financiero ausente | **Null/deshabilitado**, recaudacion_conciliada=false. No sumar componentes como neto hasta reconciliar historia y reembolsos reales. |
| saldo_pendiente | Cohorte ventas / cobertura actual | Total − pagos confirmados de cualquier fecha − aplicaciones verificadas. Validar anticipo, aplicación global<=original, cita/visita/clienta y sobrepago. Anticipo legacy venta_id bloquea saldo. |
| costo_servicios | consumos_servicio reales | SUM cantidad×costo_snapshot; verificar salida y confirmación auditada de consumo real. Receta no es costo real. |
| costo_productos | detalles PRODUCTO | SUM cantidad×costo_snapshot, validar salida única y costo coincidente. Cero solo si verificable; compra posterior no cambia historia. |
| costo_directo | Dos fuentes anteriores | Suma exacta antes de cuantizar; null si evidencia incompleta. Compras no se vuelven a restar como gasto. |
| margen_contribucion | Ingreso y costo | Ingreso operativo−costo exacto, antes de comisiones y gastos. |
| comisiones | detalle SERVICIO | SUM HALF_UP((neto−global asignado)×porcentaje_snapshot/100,2). Sin propina ni comisión de producto. |
| margen_tras_comisiones | Anteriores | Ingreso operativo−costo exacto−comisiones. |
| utilidad_estimada | Anteriores + gastos | Margen tras comisiones−gastos locales registrados; no neta fiscal ni costos omitidos. Null con costo no probado, cabecera inconsistente o cohorte con gastos no asignables. |
| gastos_operativos | gastos_operativos / fecha DATE | SUM monto por categoría. No compras de inventario ni supuesto de compras pagadas. |
| ticket_promedio | ventas confirmadas | SUM total / COUNT ventas; incluye propina. Sin ventas=0, no división por cero. |
| visitas_finalizadas | visitas FINALIZADA / fin_en | COUNT DISTINCT visita, no cita programada ni visita cancelada. Excluir cita terminal. |
| clientas_unicas_atendidas | Mismas visitas | COUNT DISTINCT clienta atendida. No denominador de ticket. |
| stock_bajo | vw_stock_actual + articulo activo / ahora | Existencia <= mínimo. No sumar cantidades de unidades distintas ni inferir lotes. |
| cumpleaños/inactividad | clientas activas validadas / ahora | Cumpleaños [hoy,hoy+30), Feb29→Feb28 no bisiesto. Inactividad sin visita finalizada últimos90d, incluye nunca atendidas; no mensaje. |

Ejemplo comprobado: servicio80−10 y dos productos20 => subtotal110, descuento global10, propina5, total105. Ingreso servicio63.64 y producto36.36; costo real0.60+6.00=6.60; comisión6.36; margen contribución93.40; tras comisión87.04; gastos7 => utilidad_estimada80.04. Pagos10+20 => cobros30, saldo75; no multiplicar105 por número de líneas/pagos.

Ejemplo de anticipo: recibido30 en septiembre; servicio80 en octubre, aplicaciones10+20, pago50 en octubre. Septiembre anticipos30; octubre venta80/cobros50/anticipos0/saldo0. No hay ingreso nuevo al aplicar ni pago ficticio30. Los componentes siguen separados porque no se ha implementado neto conciliado con reembolsos.

Estados son actuales: un pago anulado hoy deja de figurar incluso al consultar el mes pasado. Sin ledger de ajustes no se reconstruye el cierre bancario anterior. `saldo_pendiente` se calcula al consultar, no a hasta. Los indicadores de stock/clientas también son actuales y van etiquetados. No se promete cierre histórico certificado ni FIFO real por lote.

Referencias primarias: [Decimal](https://docs.python.org/3/library/decimal.html), [transacciones de Django](https://docs.djangoproject.com/en/5.2/topics/db/transactions/), [aislamiento PostgreSQL](https://www.postgresql.org/docs/18/transaction-iso.html), [celdas openpyxl](https://openpyxl.readthedocs.io/en/stable/api/openpyxl.cell.cell.html).
