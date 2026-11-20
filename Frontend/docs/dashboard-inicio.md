# Inicio y Finanzas

El dashboard muestra los gráficos de evolución y medios de pago junto a cuatro indicadores: ventas confirmadas, cobros registrados, utilidad operativa estimada y saldo por cobrar. El período inicial es «Últimos 7 días»; las fechas y las opciones de gráficos se muestran directamente en un solo bloque. Los importes de la evolución y la tabla de medios de pago permanecen visibles, sin desplegables ni gráficos duplicados. La agrupación y las opciones de gráficos están junto a las fechas. El inicio consulta resumen, evolución y medios de pago; los desgloses y la exportación están en Finanzas.

El enlace «Ver Finanzas» abre Reportes, donde se puede alternar entre «Reportes detallados» y «Resumen visual». Esta última vista contiene los gráficos, rankings de tratamientos y clientas, gastos, alertas de inventario y comparación mensual. Sus filtros y controles de gráficos están reunidos arriba; actualizar y exportar Excel permanecen abajo como opciones.

Se conservan los permisos por reporte, los importes decimales del servidor, los estados no disponibles y las restricciones de conciliación. La vista visual requiere permiso de resumen; quienes solo tienen permiso de clientas o inventario siguen accediendo a sus reportes autorizados.

Verificación: pruebas de consultas del inicio, filtros y controles trasladados a Finanzas, permisos y diseño adaptable. Las pruebas E2E usan PostgreSQL temporal, sin escribir en la base operativa.
