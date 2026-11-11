# Entrega y verificación Fase 5

Fecha: 2026-11-06. **Implementación probada y activada en Lasheo después de autorización explícita.** Las limitaciones de compensación y despliegue productivo se detallan abajo.

## Resultados realmente ejecutados

| Verificación | Resultado |
|---|---|
| Suite original antes de implementar | 165 pruebas, OK, 24.491 s |
| Regresión final completa, incluidas fases 1–4 | **223 pruebas, OK, 33.666 s**, salida del proceso 0 |
| Pruebas nuevas financieras/contrato | 58 incluidas en la regresión |
| PostgreSQL aislado | `test_lasheo_phase1_5d08ca19dbb3`, creado y eliminado por runner |
| `manage.py check --database default` | Sin incidencias |
| `makemigrations finanzas --check --dry-run` | Sin cambios pendientes de generar |
| `pip check` / compileall del código nuevo | Dependencias y sintaxis correctas |
| Restauración completa del backup previo Fase 5 | BD temporal independiente: 45 tablas, 7 vistas; eliminada después |
| Huellas de Lasheo comparadas con baseline | Esquema completo y todas las filas de negocio sin cambios |
| Activación en modo revisión | SQL exportado, ninguna modificación de base real |
| Disponibilidad con usuario autorizado y sin migración | HTTP 503 `fase5_migracion_pendiente`, lectura sin escrituras |
| Activación autorizada posterior | `finanzas.0001_finance_support` aplicada, respaldo fresco, solo 2 tablas añadidas |
| Comparación de activación | Columnas, constraints, índices, triggers y vistas originales intactos; filas de las 34 tablas de negocio preservadas |
| Comprobación posterior de solo lectura | 47 tablas, 7 vistas, 9 permisos; consultas de visitas/ventas/profesionales/pagos/anticipos HTTP 200, listas vacías |
| `manage.py migrate --check` después de activar | Sin migraciones pendientes |
| Chequeo deploy con DEBUG/demo desactivados y URLs HTTPS temporales | Sin incidencias; solo simulación de configuración, no despliegue |
| Contrato OpenAPI | 84 rutas totales, 20 financieras; métodos/CSRF/idempotencia comprobados |

Evidencia privada: `backups/phase5-baseline-tests.log`, `backups/phase5-final-tests.log`, `backups/phase5-baseline.json`, dump `*_before_phase5.dump`. Contienen información operativa o datos del respaldo; no publicarlos. El log final lista cada prueba. No se usó SQLite.

## Escenarios cubiertos

- Decimal/HALF_UP, centavos exactos, descuentos de línea/global, propina, límites, float/NaN/infinito y margen negativo.
- Visita manual y desde llegada confirmada, clienta coincidente, una visita por llegada y una venta por visita, notas/historial y cancelaciones.
- Borrador con servicios/productos, reemplazo de líneas, precio de catálogo y excepción autorizada, snapshots históricos que sobreviven cambios posteriores, venta gratuita con costo realmente cero.
- Previsualización sin movimientos, receta estimada distinta al consumo real, revisión obligatoria, declaración explícita sin insumos, unidades/tipos/cantidades y costo desconocido.
- Stock agregado para artículo vendido y consumido; falta de stock bloquea todo; UNIQUE de salida por producto/consumo; fallo en segundo movimiento revierte estados, consumos, stock, auditoría y clave.
- Confirmación con igual clave concurrente (incluido servicio con consumo real), dos claves sobre misma venta, dos ventas por última unidad, venta contra ajuste de Fase 3. Solo el resultado válido persiste; no hay saldo negativo ni doble descuento.
- Pagos mixtos/parciales, sobrepago, referencia duplicada entre fuentes, claves repetidas/cambiadas y destinos distintos; carrera de pagos sobre saldo y replay concurrente.
- Anticipo pendiente/confirmado/cancelado, aplicación 10+20 y pago70 sobre venta100 con anticipo30, sin nuevo pago por aplicar; límites, cita/clienta/visita, carrera de aplicaciones, vínculo heredado y bloqueo de conciliación ambigua.
- Anulación de pago por error con auditoría y permiso separado; venta confirmada/anticipo cobrado no se borran ni reembolsan mediante cancelación simple.
- Anónimos, no staff y staff sin permisos rechazados en todos los endpoints; sesión real y CSRF; ninguna PII en resultado idempotente.
- Migración nueva y reversión/avance en aislamiento conservan columnas/vistas originales; nuevas FK reales y CHECK positivo definidos; invariantes originales 34 tablas/7 vistas siguen verificándose aparte del soporte añadido.
- Ejemplos JSON validados contra DTO reales y rutas OpenAPI resueltas con métodos, permisos documentados y encabezados obligatorios.

## Archivos creados y cambios relevantes

- `apps/finanzas/domain/{commands,errors,money}.py`: comandos tipados y reglas puras.
- `apps/finanzas/application/{visits,sales,payments,advances,selectors,audit}.py`: casos de uso y lecturas financieras.
- `apps/finanzas/infrastructure/{idempotency,schema}.py`: transacción compartida, replay persistente y bloqueo hasta activación.
- `apps/finanzas/presentation/{permissions,serializers,views,urls}.py`: API privada por acción.
- `apps/finanzas/models.py` y `migrations/0001_finance_support.py`: dos tablas de soporte propuestas.
- `apps/finanzas/tests/`: reglas, integración, permisos, carreras reales, migración y contrato.
- `docs/finanzas-api.md`, `docs/migrations/phase5-additive.sql`, referencias y ejemplos de este módulo.
- `scripts/phase5_{snapshot,activation,verify}.py`, `scripts/update_finance_openapi.py`: comparación/backup, revisión, activación controlada y comprobación posterior, contrato.
- Actualizados `config/settings.py`, `config/urls.py`, `negocio/models.py` (defaults ORM que ya existen en SQL), `apps/inventario/services.py` (servicio único de salidas), comprobaciones previas de esquema, generadores OpenAPI, verificador de backup, README y CHANGELOG.

## Problemas corregidos durante la implementación

Faltaban modelos de idempotencia y aplicación parcial: diseño aditivo sin tocar el esquema original. Se corrigió la inserción inicial de borrador con descuento antes de disponer de líneas (violaba CHECK de total). Se completaron defaults ORM heredados para no enviar null donde PostgreSQL ya tenía defaults. Se evitó tratar costo desconocido como cero y descontar por separado un artículo que también se consume. Se incluyó destino en hash para no reutilizar clave sobre otro objeto. Se preservaron notas al abrir desde llegada y motivo al cancelar. Se bloquearon fuentes antiguas ambiguas en vez de inferir que no había duplicación de caja. En pruebas se corrigieron citas ficticias solapadas y el nombre de un helper que interfería con TestCase; no se alteraron las reglas SQL para hacerlas pasar.

## Pendientes y límites

1. Activación **resuelta** con autorización: migración aplicada y disponibilidad 200 comprobada; informe de activación y esquema físico de 47 tablas/7 vistas verificados. En otros despliegues se requiere su propia revisión/autorización.
2. Reembolsos reales, devolución de producto y reversión de aplicaciones requieren el ledger compensatorio propuesto; operaciones bloqueadas con 409. No son parte implementada como si fueran seguras.
3. Fase 6: conciliar vistas SQL con descuentos globales, comisión neta y caja original de anticipos. Las siete vistas actuales no fueron modificadas.
4. Configuración productiva y privacidad siguen pendientes; modo ficticio local autorizado, sin URL/dominio real. No se configuró publicación. El chequeo deploy simulado no significa producción lista.
5. No hay fallo crítico conocido en la suite ejecutada ni pruebas obligatorias omitidas de la implementación entregada. La verificación de Lasheo activada se realizó sin crear operaciones de negocio. No se afirma que el despliegue productivo esté listo.
