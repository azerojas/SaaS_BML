# Auditoría real y remediación — 2026-11-10

La skill aplicada es beauty-manager-backend-fase-8, recibida en Downloads/SKILL fase8.md. Sus referencias anexas no estaban disponibles en Downloads/references; se revisó el código y las fuentes oficiales directamente. No se asume certificación OWASP ni auditoría tributaria/legal.

| Fase | Evidencia existente y verificada | Estado/límites |
|---|---|---|
| 1 auth/clientas | Sesiones, CSRF, contraseñas Django, teléfono normalizado, auditoría y 13 FK a auth_user | Implementado; se corrige RBAC legacy y se añade MFA operativo |
| 2 catálogo | Servicios/artículos/unidades/recetas y referencias de imágenes, snapshots | Implementado; no hay proveedor de imágenes ni uploads binarios |
| 3 inventario | Compras recibidas, movimientos, ajustes, saldo, locks y defensa de stock | Implementado; no equivale a trazabilidad de lotes físicos o valorización contable formal |
| 4 QR | Token revocable de tienda, throttling PostgreSQL/HMAC, anti-enumeración, consentimiento y confirmación humana, una visita | Implementado; QR no acredita identidad ni presencia física; aviso local ficticio no comercial |
| 5 finanzas | Transacciones, idempotencia, snapshots, consumos reales, pagos parciales y aplicaciones de anticipo | Implementado; no hay libro trazable de reembolsos ni conciliación bancaria/caja formal |
| 6 dashboard | Agregaciones sin multiplicar joins, períodos Lima, rankings, Excel y permisos | Implementado; recaudación neta conciliada bloqueada/null, no se inventa ganancia contable |
| 7 agenda | Profesionales/especialidades/horarios/bloqueos, EXCLUDE, reservas/reprogramación/cancelación/espera y QR | Implementado; escritura pública deliberadamente cerrada, scheduler no estaba activado |

Defectos corregidos y reversión:

| Hallazgo | Severidad | Corrección | Reversión |
|---|---|---|---|
| is_staff daba acceso amplio a recursos legacy | Alta | Permiso de modelo por operación y pruebas negativas/positivas | Restaurar código anterior reabre exposición; evitar, corregir asignaciones revisadas |
| Falta MFA y revocación operativa | Alta en despliegue comercial | TOTP cifrado, anti-replay, bloqueo y recuperación; obligatorio staging/prod | Volver a versión previa solo en local; conservar tablas y claves |
| Configuración única/secretos locales disponibles a entornos | Alta | Settings separados; production/CI no cargan .env de desarrollo | Cambiar DJANGO_SETTINGS_MODULE únicamente para desarrollo local |
| Rol DB propietario y ausencia de TLS verificado | Alta para comercial | Política SQL y readiness estricta; probado con rol sintético sin DDL y verify-full | No aplicado al cluster principal; restaurar grants de snapshot revisado si se activan |
| No había operación de expiración/sesiones/counters programable | Media | Job idempotente con advisory lock, límites y heartbeat, flag explícito | Desactivar scheduler/flag; no deshacer expiraciones ya auditadas |
| Logs podían incluir rutas/tokens/trazas | Alta | Allowlist JSON, route pattern, ID servidor; 500 genérico | Volver a configuración previa solo tras revisar PII; retener logs según política |
| Pruebas de agenda dependían de 2026-11-09 | Media | Fixtures de martes futuro con reloj coherente | Solo cambio de tests, sin efectos de negocio |
| Construcción Docker desde OneDrive fallaba por reparse points | Operativa | Tar de fuentes permitidas; excluye secretos/copias/cache | Docker build directo desde checkout normal |
| Restauración podía fallar por ruta Unicode/representación SQL equivalente | Operativa | Dump por stdout y normalización limitada de casts de arrays constantes; hashes de todas las filas | Conservar dump; nunca ignorar diferencias generales de esquema |

Amenazas cubiertas por controles y pruebas: BOLA/permisos por recurso, CSRF, cookies, repetición MFA/pagos/anticipos/materiales, QR duplicado y enumeración, agenda simultánea, escape de fórmulas Excel, fallo/rollback, logging sin PII y alteración de respaldo. Los límites de rate en PostgreSQL coordinan workers; no sustituyen defensa perimetral ante DDoS. Un único local/equipo no ofrece alta disponibilidad.

Los 7 views SQL se conservan. vw_ingresos_diarios y márgenes históricos no se presentan como caja conciliada: falta registrar compensaciones/reembolsos de manera trazable y algunos anticipos legacy pueden ser ambiguos. Se devuelve limitación explícita y se bloquea el saldo ambiguo, sin corregir importes reales automáticamente.

Fórmulas reutilizadas: total = suma(cantidad × precio histórico − descuento línea) − descuento global + propina; saldo = total − pagos confirmados no anulados − aplicaciones de anticipo; registrar anticipo no crea pago. Costo directo histórico = productos vendidos + insumos consumidos realmente. Contribución excluye propinas; utilidad estimada resta comisiones históricas y gastos del período. No equivale a utilidad tributaria ni caja neta conciliada. Ver finanzas-api.md y reporting-api.md para redondeo/prorrateo.

No se añadieron índices sin evidencia: el fixture de 1.000 ventas ya se consulta con número de queries acotado. Se preservan select_related/prefetch, agregaciones por entidad, límites de períodos/filas y EXCLUDE/UNIQUE. Timeouts SQL, lock y conexión en producción evitan esperas indefinidas. El lock global financiero prioriza consistencia y limita throughput; evaluar contención antes de aumentar volumen.

Fuentes revisadas: [Django deployment](https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/), [OWASP ASVS](https://asvs.owasp.org/), [Railway Docker](https://docs.railway.com/builds/dockerfiles), [healthchecks](https://docs.railway.com/deployments/healthchecks), [cron](https://docs.railway.com/cron-jobs), [red privada](https://docs.railway.com/networking/private-networking). No se contrató ningún servicio ni se prometió SLA/failover.
