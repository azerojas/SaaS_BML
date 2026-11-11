# Informe de implementación y verificación — Fase 6

Fecha 2026-11-06, America/Lima. **Reportes implementados, probados y permisos activados con autorización. La fase no se declara totalmente concluida: recaudación neta conciliada bloqueada.**

## Evidencia ejecutada

| Verificación | Resultado real |
|---|---|
| Suite anterior, antes de desarrollar | 223 tests, OK, 33.539 s |
| Regresión final fases 1–6 | **267 tests, OK, 61.602 s**, proceso finalizado con código 0 |
| Pruebas nuevas de reporting | 44, incluidas en la regresión |
| Aislamiento | PostgreSQL `test_lasheo_phase1_a09c25d20c04`, creado y eliminado por runner; no SQLite |
| Respaldo de Fase 6 restaurado en otra BD temporal | 47 tablas, 7 vistas; scratch eliminado después |
| Auditoría PostgreSQL instalado | 47 tablas, siete vistas auditadas, 13 FK de usuarios, PEN/Lima |
| Esquema/filas reales vs baseline | Sin cambios de negocio al cierre de implementación |
| `manage.py check --database default` | Sin incidencias |
| `makemigrations reporting finanzas --check --dry-run` | Sin cambios de modelos pendientes de generar |
| `pip check`, compileall código/scripts nuevos | Sin incidencias, openpyxl 3.1.5 instalado |
| `check --deploy` con configuración HTTPS/demo=False temporal | Sin incidencias; simulación de configuración, no despliegue productivo |
| OpenAPI | 94 rutas totales, diez nuevas de reporting; query examples y seguridad comprobadas |
| Migración proxy en aislamiento | Retirar/reponer estado no altera tablas/vistas |
| Activación real autorizada | 4 permisos registrados; esquema y filas de negocio iguales al baseline, 47 tablas/7 vistas |
| Comprobación posterior en Lasheo | Nueve consultas autenticadas HTTP200; neto conciliado sigue null/false; ninguna exportación real generada |
| `manage.py migrate --check` posterior | Sin migraciones pendientes |

Logs privados: `backups/phase6-baseline-tests.log`, `phase6-final-tests.log` (lista cada prueba), `phase6-installed-schema.json`, `phase6-baseline.json`, `phase6-performance.json`. Dump `*_before_phase6.dump` contiene datos reales y debe mantenerse privado. El paquete de pruebas nunca usa Lasheo como destino destructivo.

## Escenarios probados

- Venta de dos líneas y dos pagos cuenta su total una sola vez; subtotal/total se validan antes de mostrar ingresos derivados.
- Descuentos globales/de línea, propina y comisión correctos. Ejemplo105 total, costo6.60, comisión6.36, gastos7, utilidad estimada80.04. Descuento de un centavo se asigna por mayores restos estable.
- Ventas y cobros en distintos meses/días, medianoche Lima exacta y microsegundo anterior; `hasta` exclusiva; meses bisiestos y semanas lunes.
- Anticipo cobrado en septiembre y aplicado10+20 en octubre con pago50: no otro cobro, saldo0. Vínculo legacy bloquea saldo y neto siempre queda deshabilitado sin ledger.
- Pago/venta anulados excluidos; cita cancelada requiere timestamp según CHECK real, anticipo de cita terminal excluido con advertencia, no se altera su estado para fingir reembolso.
- Receta no se usa como consumo real. Costos snapshots/salidas verificadas; fuente ausente o servicio antiguo sin revisión explícita deshabilita costo/margen/utilidad, no lo cambia a cero. Compras no se restan como gasto nuevamente.
- Cohorte seleccionada por EXISTS único sobre servicio/profesional de misma línea; no satisfacen filtros dos líneas diferentes. Ventas completas conservan prorrateo; gastos no se asignan artificialmente a cohortes.
- Rango sin ventas, ticket0, base0 de comparación retorna null, utilidad negativa, cliente sin visitas, cumpleaños Feb29 en no bisiesto y QR provisional excluido.
- Inventario activo desde vista original, igualdad al mínimo y foto actual sin lote/valorización inventados.
- Anónimos/no staff/staff sin permiso rechazados en los diez endpoints. `export` solo no concede consulta; summary no concede clientas/inventario; exportación de clientas con permisos mínimos no filtra utilidad/costos generales en Resumen.
- XLSX legible por openpyxl, hojas y totales coinciden con API, celdas monetarias numéricas, campos bloqueados vacíos; inyección `=`, `+`, `-`, `@`, tab/espacios/CR neutralizada como texto, sin fórmulas o hyperlinks.
- Exportaciones auditadas sin PII, cinco/minuto/cuenta, tipo/rango/filas/orden validados; fallo de archivo no crea auditoría ni entrega archivo sin trazabilidad.
- PostgreSQL rechaza escritura dentro de snapshot (SQLSTATE25006), snapshot permanece consistente con escritura concurrente y timeout real se convierte en error422, recuperando conexión.
- Volumen excesivo se rechaza, nunca suma parcial; contratos y ejemplos se validan contra parsers/rutas reales.

## Rendimiento observado y optimizaciones

Fixture aislado de 1000 ventas/1000 líneas PRODUCTO con snapshots y salidas. Overview necesitó **22 consultas** tanto para cohorte de100 como de1000 ventas: no hay N+1. Tiempo de la última regresión aproximadamente **0.152 segundos** (evidencia exacta en JSON), sin incluir preparación de datos. EXPLAIN ANALYZE BUFFERS sobre la consulta por fecha registró uso de `idx_ventas_confirmadas_fecha`. Son mediciones del equipo local y este volumen, no un SLA ni ensayo productivo.

Cabeceras se consultan aparte de colecciones 1:N; líneas, consumos y movimientos se cargan en lotes acotados; pagos/aplicaciones se agregan por venta/anticipo, no se multiplican joins. Series y métodos/gastos/rankings de clientas agregan en SQL. EXISTS selecciona cohortes; stock reutiliza la vista original. Excel overview reutiliza un solo resultado para Resumen/detalle. Períodos vacíos se rellenan en memoria con límite de rango. Sin caché personal ni materialización; no se justificó nuevo índice.

## Archivos creados/modificados

- Nuevo `apps/reporting/domain/{errors,periods,metrics}.py`: filtros inmutables, límites y semántica; reutilización financiera de Fase5.
- Nuevo `apps/reporting/application/{services,exports}.py`: consultas de reporte y acceso Excel auditado.
- Nuevo `apps/reporting/infrastructure/{repositories,snapshot,excel_export}.py`: ORM acotado, PostgreSQL solo lectura y openpyxl.
- Nuevo `apps/reporting/presentation/{permissions,serializers,views,urls}.py`: diez endpoints privados, filtros y permisos por reporte.
- Nuevo `apps/reporting/models.py` y `migrations/0001_report_permissions.py`: proxy de permisos, sin otra tabla.
- Nuevo `apps/reporting/tests/`: 44 pruebas nuevas de período, fórmulas, estados, API, permisos, Excel, calidad, aislamiento, rendimiento y contrato.
- Nuevos `docs/reporting-api.md`, `docs/migrations/phase6-permissions.sql`, referencias y ejemplos del módulo.
- Nuevos `scripts/phase6_{snapshot,audit,activation,verify}.py` y `scripts/update_reporting_openapi.py`.
- Actualizados `config/settings.py`, `config/urls.py`, `requirements.txt`, `docs/openapi.json`, `scripts/update_finance_openapi.py`, `scripts/verify_backup.py`, README/CHANGELOG. No se alteró el DDL de negocio ni definiciones de vistas.

## Correcciones y limitaciones

Se evitó usar las vistas antiguas de margen/comisión que ignoran descuento global, sumar cabecera tras joins múltiples y convertir falta de costo en costo cero. Se corrigió la exportación de un ranking privado para que no incluyera KPI generales sin su permiso. Se normalizó CR/LF de cadenas Excel sin permitir fórmulas. Fixtures de fecha/cancelación se ajustaron a los CHECK existentes; no se alteraron constraints para hacer pasar pruebas. La instalación inicial de pip requirió modo UTF-8 por el carácter Unicode de la ruta del proyecto; la dependencia quedó instalada y verificada.

Pendientes explícitos:

1. Activación de permisos **resuelta** con autorización y verificación en Lasheo. `phase6_activation.py` no aplica nada sin `--apply --database-name Lasheo`; no añade tablas. Evidencia privada `phase6-activation-report.json`. Otros entornos requieren su propia revisión/autorización.
2. **Dinero recaudado neto conciliado bloqueado.** Falta ledger de reembolsos/eventos y conciliación bancaria/legado. La propuesta futura está documentada; no se aplicó ni se habilitó un neto ficticio.
3. Utilidad entregada es solo estimada operativa con costos/gastos registrados, sin impuestos/depreciación/otros gastos omitidos; nula donde falte evidencia. No se certifica utilidad contable/fiscal.
4. Saldos y estados actuales no reconstruyen cierre histórico de ajustes/anulaciones. Inventario/clientas son fotos actuales, sin FIFO real por lote.
5. Despliegue HTTPS y aviso real de privacidad siguen pendientes de su fase. No se publicó sitio, ni se implementaron frontend, WhatsApp o microservicios.

No hay fallo crítico conocido en la suite aprobada de la funcionalidad entregada. Las limitaciones anteriores se devuelven en API/Excel y evitan declarar completa la Fase6.
