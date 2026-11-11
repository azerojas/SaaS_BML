# Resultado de la fase 3

Fecha: 6 de noviembre de 2026, America/Lima.

| Verificación ejecutada | Resultado |
|---|---|
| Diagnóstico previo y regresión inicial | 79 pruebas de fases 1 y 2 aprobadas |
| Suite consolidada final | 122 pruebas aprobadas, 14.948 segundos de ejecución de tests |
| Nuevas pruebas de inventario | 43, incluidas 6 de concurrencia PostgreSQL real |
| check --database default | Sin errores |
| migrate --check | Sin migraciones pendientes |
| pip check | Sin conflictos de dependencias |
| compileall | Sin errores de sintaxis |
| check --deploy --fail-level WARNING con DJANGO_DEBUG=False | Sin advertencias |
| Contrato OpenAPI | 1.2.0, 50 rutas consolidadas; referencias y resolución comprobadas en la suite |
| Respaldo previo de fase 3 | Restaurado completamente en una base temporal: 45 tablas físicas y 7 vistas |
| Base Lasheo al finalizar | Misma huella de esquema y mismas filas de las 34 tablas de negocio |
| HTTP real tras reiniciar servidor | Catálogo público 200, seis consultas privadas de inventario/proveedores/compras rechazan anónimos con JSON 403, login del panel 200 |

No se modificó el esquema ni se ejecutaron migraciones de fase 3. Las 13 FK a usuarios y las restricciones originales siguen presentes. La cuenta ficticia existente conserva sus credenciales; no se incluyen secretos en el reporte. La comprobación HTTP de esta fase fue de solo lectura.

## Demostración ejecutada en base aislada

El test test_isolated_end_to_end_demonstration creó un proveedor y un artículo ficticios, una compra BORRADOR con 5.000 unidades a costo 1.2500, la recibió y verificó stock 5.000. Registró un AJUSTE_SALIDA de 4.000, comprobó stock 1.000 y una alerta porque el mínimo era 2.000. El ledger terminó con dos movimientos. Ninguno de esos registros se insertó en Lasheo.

Las otras pruebas cubren recepción repetida/concurrente sin duplicados, dos salidas compitiendo por el mismo saldo, clave de ajuste repetida, orden estable de bloqueos entre compras, recepción vs salida y cambio de unidad de catálogo vs ajuste. El fallo después del primer movimiento de recepción revierte toda la operación. Se probaron inmutabilidad, UNIQUE parcial, precisiones, totales, permisos, CSRF y costos desconocidos frente a compras gratuitas.

El servidor de desarrollo quedó actualizado en http://127.0.0.1:8000/. Los endpoints nuevos son privados y la API está lista para la integración Angular de estas operaciones; no se construyeron pantallas.

## Límites y trabajo posterior

Costos de consulta: promedio ponderado histórico de compras recibidas. Ajustes: cantidades NO_VALORIZADO. No hay política de costo contable de salida, FIFO, devoluciones a proveedor ni saldo actual por lote. Las alertas de vencimiento conservan esa limitación expresamente. No se registraron ventas, visitas, consumos, QR o citas.

No quedaron pruebas obligatorias pendientes del alcance implementado. No se hizo prueba de carga ni despliegue. Siguen pendientes decisiones de costo de consumo, infraestructura HTTPS/rol PostgreSQL mínimo/respaldos externos, fotos aprobadas y aviso de privacidad de las fases anteriores.

Archivos, protocolo de bloqueos y operación: [inventario-api.md](inventario-api.md). Endpoints, ejemplos, contratos Angular y errores: [api-contract.md](../apps/inventario/references/api-contract.md). Cobertura y reproducción: [test-checklist.md](../apps/inventario/references/test-checklist.md).
