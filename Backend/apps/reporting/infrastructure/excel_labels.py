"""Business labels for the workbook; internal API keys never become column titles."""
LABELS={
    'ventas_confirmadas':'Ventas confirmadas','numero_ventas':'Número de ventas',
    'ingreso_por_servicios':'Ingresos por tratamientos','ingreso_por_productos':'Ingresos por productos',
    'ingreso_operativo':'Ingresos por ventas sin propinas','cobros_registrados':'Cobros registrados',
    'anticipos_recibidos':'Anticipos recibidos','dinero_recaudado':'Recaudación conciliada',
    'saldo_pendiente':'Saldo por cobrar','costo_directo':'Costo de productos e insumos',
    'costo_servicios':'Costo de insumos de tratamientos','costo_productos':'Costo de productos vendidos',
    'margen_servicios_antes_comisiones':'Margen de tratamientos antes de comisiones',
    'margen_productos':'Margen de productos','comisiones':'Comisiones',
    'margen_contribucion':'Margen antes de comisiones y gastos',
    'margen_tras_comisiones':'Margen después de comisiones','propinas':'Propinas',
    'gastos_operativos':'Gastos operativos','utilidad_estimada':'Resultado operativo estimado',
    'ticket_promedio':'Venta promedio','visitas_finalizadas':'Visitas finalizadas',
    'clientas_unicas_atendidas':'Clientas atendidas en visitas finalizadas',
    'stock_bajo':'Artículos con stock bajo','cumpleanios_proximos':'Cumpleaños próximos',
    'clientas_inactivas':'Clientas sin visitas recientes','ajustes_comerciales':'Ajustes comerciales',
    'ventas_netas_ajustes':'Ventas después de ajustes','entradas_conciliadas':'Entradas de caja conciliadas',
    'salidas_conciliadas':'Devoluciones conciliadas','ingreso':'Ingresos por tratamientos vendidos',
    'visita_id':'N.º de visita','clienta_id':'N.º de clienta','servicio_id':'N.º de tratamiento',
    'articulo_id':'N.º de artículo','categoria_id':'N.º de categoría',
    'nombre':'Nombre completo','inicio_en':'Ingreso al salón','fin_en':'Fin de la visita',
    'estado':'Estado de la visita','tratamiento':'Tratamiento','reservas':'Citas programadas o atendidas',
    'reservas_recibidas':'Reservas recibidas','personas':'Clientas con cita en el período','cantidad':'Cantidad','descripcion_snapshot':'Tratamiento',
    'etiqueta':'Fecha o período','metodo':'Medio de pago','pagos_count':'Cantidad de pagos',
    'anticipos_count':'Cantidad de anticipos','fecha':'Fecha','tipo':'Tipo',
    'categoria':'Categoría','monto':'Importe','existencia':'Existencia',
    'stock_minimo':'Stock mínimo','unidad':'Unidad','bajo_minimo':'Stock bajo',
    'articulos_activos':'Artículos activos','sin_existencia':'Artículos sin existencia',
    'stock_negativo':'Artículos con stock negativo','indicador':'Indicador','valor':'Valor',
    'definicion':'Qué incluye','visitas_registradas':'Visitas registradas',
    'personas_visitantes':'Personas con visita registrada','egresos_registrados':'Gastos y devoluciones',
}
DESCRIPTIONS={
    'ventas_confirmadas':'Ventas confirmadas durante el período, incluidas las propinas. No equivale a dinero cobrado.',
    'numero_ventas':'Cantidad de ventas confirmadas en el período.',
    'ingreso_por_servicios':'Tratamientos vendidos, después de descuentos y sin propinas.',
    'ingreso_por_productos':'Productos vendidos, después de descuentos y sin propinas.',
    'ingreso_operativo':'Ventas de tratamientos y productos, sin propinas.',
    'cobros_registrados':'Pagos confirmados recibidos en el período; los anticipos se muestran por separado.',
    'anticipos_recibidos':'Anticipos confirmados de citas vigentes. No sumar nuevamente su aplicación a una venta.',
    'dinero_recaudado':'Importe disponible únicamente cuando la caja tiene conciliación vigente con evidencia.',
    'saldo_pendiente':'Saldo actual por cobrar de las ventas confirmadas del período.',
    'costo_directo':'Costo verificable de productos vendidos e insumos consumidos; no vuelve a sumar las compras.',
    'costo_servicios':'Costo verificable de los insumos utilizados en tratamientos vendidos.',
    'costo_productos':'Costo de adquisición de los productos vendidos.',
    'comisiones':'Comisiones de los tratamientos según los porcentajes registrados al vender.',
    'gastos_operativos':'Gastos registrados por fecha, sin volver a sumar compras de inventario.',
    'utilidad_estimada':'Ventas sin propinas menos costos, comisiones, gastos y ajustes. No es utilidad fiscal.',
    'ticket_promedio':'Importe promedio de las ventas confirmadas.',
    'visitas_finalizadas':'Visitas terminadas en el período; su listado completo se encuentra en Visitas.',
    'clientas_unicas_atendidas':'Personas distintas en visitas finalizadas del período.',
    'stock_bajo':'Situación actual del inventario; no reconstruye el stock al cierre del período.',
    'cumpleanios_proximos':'Clientas activas con cumpleaños en los próximos 30 días.',
    'clientas_inactivas':'Clientas activas sin visita finalizada en los últimos 90 días.',
    'visitas_registradas':'Todas las visitas iniciadas en el período, con y sin venta. Las anuladas se identifican por su estado.',
    'personas_visitantes':'Personas distintas que figuran en la hoja Visitas; cada visita conserva su propia fila.',
    'egresos_registrados':'Gastos operativos y reembolsos registrados. No presupone el pago de compras de inventario.',
}
WARNINGS={
    'ESTADOS_ACTUALES_NO_RECONSTRUYEN_CIERRES_HISTORICOS':'Los estados reflejan la situación actual de los registros.',
    'UTILIDAD_OPERATIVA_ESTIMADA_NO_FISCAL':'El resultado operativo es estimado y no constituye un cálculo tributario.',
    'COSTO_REAL_NO_VERIFICABLE':'Hay costos sin respaldo suficiente; sus importes se dejan en blanco.',
    'TOTALES_NO_CONCILIAN':'Algunas ventas requieren revisión porque sus totales no coinciden.',
    'FALTAN_CONCILIACIONES_CON_EVIDENCIA':'La caja todavía no tiene todas las conciliaciones necesarias.',
    'GASTOS_NO_ASIGNADOS_A_COHORTE':'Los gastos son del establecimiento y no se atribuyen a una especialista o tratamiento.',
    'INVENTARIO_ACTUAL_NO_HISTORICO':'El inventario corresponde al momento de generar el archivo.',
}
VALUES={'ABIERTA':'Abierta','FINALIZADA':'Finalizada','ANULADA':'Anulada',
    'EFECTIVO':'Efectivo','YAPE':'Yape','PLIN':'Plin','TRANSFERENCIA':'Transferencia',
    'TARJETA':'Tarjeta','OTRO':'Otro','INSUMO':'Insumo','PRODUCTO':'Producto'}


def label(key):return LABELS.get(key,key.replace('_',' ').capitalize())


def description(key):return DESCRIPTIONS.get(key,'Importe o cantidad del período seleccionado.')


def warning_text(key):return WARNINGS.get(key,key.replace('_',' ').capitalize()+'.')
