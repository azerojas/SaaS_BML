# Entrega y verificación — Fase 7

Activación y revisión de cierre: 2026-11-10, America/Lima. Implementación probada y diez permisos activados en Lasheo con autorización explícita. El alcance es agenda privada y consulta pública opcional, sin alta/cancelación anónima ni WhatsApp.

## Pruebas y comprobaciones ejecutadas

| Verificación | Resultado registrado |
|---|---|
| Regresión anterior, antes de implementar | 267 pruebas, OK, 61.178 s |
| Regresión completa fases 1–7 | **314 pruebas, OK, 81.559 s**, proceso finalizado con código 0 |
| Pruebas nuevas de agenda | 47, incluidas en la regresión |
| PostgreSQL de prueba | `test_lasheo_phase1_f7cbfdd2edaf`, creado y eliminado por el runner; no SQLite |
| Respaldo previo Fase7 restaurado en scratch | 47 tablas/7 vistas, base temporal retirada después |
| Auditoría del esquema instalado | 47 tablas físicas, siete vistas, 13 FK a usuarios, funciones/triggers y EXCLUDE existentes |
| Comparación de esquema y filas reales con baseline | Sin cambios de negocio |
| `manage.py check --database default` | Sin incidencias; comprobado nuevamente al retomar el 9 de noviembre |
| Estado de migración en Lasheo | `agenda.0001_agenda_permissions` aplicada con autorización; diez permisos registrados |
| Comprobación posterior a activar | Consultas privadas autenticadas HTTP 200; 47 tablas, siete vistas y todas las filas de negocio preservadas |
| `manage.py migrate --check` y check de BD posteriores | Sin migraciones pendientes, sin incidencias |
| OpenAPI | 121 rutas totales; 27 nuevas de agenda (24 privadas y 3 públicas), 39 operaciones |

Evidencia privada en `backups/phase7-baseline-tests.log`, `phase7-final-tests.log`, `phase7-installed-schema.json`, `phase7-baseline.json` y `phase7-performance.json`. El dump `*_before_phase7.dump` contiene información real y debe mantenerse privado. Los logs de prueba y rendimiento corresponden a las ejecuciones durante la implementación; la fecha de revisión no sustituye sus resultados registrados.

## Cobertura funcional

- Estados, intervalos semiabiertos, citas contiguas, horario ISO, paso de slots, timezone y rechazo de timestamps sin offset.
- Citas privadas calculadas por servidor; snapshots de precio/duración, generación de código/UUID en PostgreSQL, sin exponer secretos en respuestas.
- Replay con igual clave y conflicto al cambiar carga/destino; fallo posterior a inserción revierte cita, servicios, historial del trigger, auditoría y clave.
- EXCLUDE real por profesional y por clienta con dos casos diferenciados; horarios solapados, fechas ocupadas, grid inválido y servicios no asignados rechazados.
- Cambio de horario/bloqueo y retiros explícitos auditados, sin dejar citas futuras huérfanas; desactivación no elimina historia.
- Reprogramación conserva snapshots salvo servicios explícitos nuevos, audita valores anteriores/nuevos y revierte todo ante conflicto. No reduce precio bajo anticipo ya recibido.
- Anticipo requerido con Decimal/HALF_UP, pagos parciales manuales hasta cubrir importe y paso único a PROGRAMADA. No se crean pagos duplicados.
- Pendiente vencida sigue ocupando hasta expiración real; comando idempotente, rechazo de confirmación tardía, incidencia por dinero parcial retenido sin reembolso ficticio.
- Cancelación y excepción de plazo; confirmación repetida rechazada; no asistencia solo después del fin; completar solo con visita y venta coherentes.
- QR exige llegada confirmada y misma clienta; errores revierten visita nueva. Flujo cita→llegada→visita→venta→finalización integrado con reportes, sin marcar cobro.
- Espera sin duplicados, oferta manual sin mensajes, conversión atómica y referencia de cita conservada en auditoría; segunda conversión bloqueada.
- Anónimos/no staff/staff sin permisos rechazados en todas las rutas administrativas; CSRF en cada mutación, incluidos PUT/DELETE; permiso adicional de asignación de usuario/excepción.
- Consulta pública mínima, opt-out, servicios visibles/reservables, throttle compartido, rechazo de filtros personales y ausencia de rutas públicas de gestión, incluso con tokens válidos en formato.
- Contratos y payloads comprobados contra serializers/rutas reales; reversión y reposición del proxy sin DDL de negocio; vista agenda e historial de trigger contrastados.

## Concurrencia real

Con conexiones PostgreSQL independientes y barreras sincronizadas:

1. Dos reservas distintas por el mismo hueco: un ganador, sin detalles/historial del perdedor.
2. Misma clave simultánea: un registro y mismo resultado.
3. Bloqueo global contra reserva: un ganador; nunca cita dentro del bloqueo.
4. Misma clienta con dos profesionales al mismo tiempo: solo una reserva.
5. Expiración contra confirmación tardía de anticipo: cita expirada, anticipo no confirmado, cero pagos nuevos.
6. Dos conversiones de la misma espera: una sola cita.

El orden de locks comparte el financiero y de check-in antes del lock de agenda; las restricciones SQL son defensa adicional. No hay llamadas externas o mensajería en esas transacciones.

## Rendimiento y optimizaciones

Disponibilidad sobre un profesional/día: **7 consultas** tanto con calendario vacío como con30 ocupaciones; sin N+1. Última evidencia registrada: **0.006894 segundos** en el equipo de prueba. No es un SLA de producción. Se acotan servicios (10), duración (720min), rango calendario (93d), horizonte (366d), filas de página (100), lista pública (100) y lote de expiración (500).

No se añadieron índices sin evidencia de lentitud, Redis, microservicios ni tareas automáticas. Se reutilizan índices/EXCLUDE, funciones auditadas y vistas. El motor evita el falso hueco de pendientes vencidas de la función SQL original sin alterar su definición.

## Archivos creados/modificados

- `apps/agenda/domain/{commands,errors,rules}.py`: comandos inmutables, estados, intervalos y cálculo de anticipos.
- `apps/agenda/application/{administration,availability,bookings,common,advance_policy,expiry,selectors,waitlist}.py`: casos de uso, integración financiera/QR y lecturas.
- `apps/agenda/infrastructure/{repositories,transactions}.py`: ORM existente, locks y reutilización de idempotencia.
- `apps/agenda/presentation/{permissions,serializers,views,urls}.py`: contratos privados y tres consultas públicas.
- `apps/agenda/models.py`, `migrations/0001_agenda_permissions.py`: proxy de permisos, sin tabla nueva.
- `apps/agenda/management/commands/expirar_citas.py`: expiración explícita e idempotente.
- `apps/agenda/tests/`: 47 pruebas nuevas de reglas, reservas, administración, disponibilidad, anticipos, integración, permisos, carreras y contratos.
- `docs/agenda-api.md`, `docs/migrations/phase7-permissions.sql`, referencias y ejemplos del módulo.
- `scripts/phase7_{snapshot,audit,activation,verify}.py`, `scripts/update_agenda_openapi.py`: respaldo/comparación, revisión, activación autorizada, smoke de lectura y contrato.
- Actualizados `config/settings.py`, `config/urls.py`, `.env.example`, `negocio/models.py` (defaults ORM ya existentes en SQL), `apps/finanzas/application/advances.py` y `infrastructure/idempotency.py`, generador OpenAPI anterior, verificador de backup y contrato previo de reporting para distinguir sus rutas de agenda.

## Problemas corregidos

La función SQL liberaba visualmente pendientes que EXCLUDE seguía ocupando: el motor nuevo mantiene ocupación hasta transición real. La idempotencia existente no serializaba TIME de horarios: se añadió formato ISO canónico, sin float. La confirmación financiera no coordinaba vencimiento/estado de cita: ahora valida plazo y promueve una sola vez bajo los mismos locks. Se completaron defaults ORM que ya estaban en PostgreSQL, sin DDL. Se evitó duplicar historial de trigger y se conservaron los snapshots previos al reprogramar en auditoría. El contrato anterior de reporting se ajustó para verificar solo sus diez endpoints, sin contar las rutas nuevas de agenda como si fueran reportes.

## Activación y pendientes

1. Activación **resuelta** el 2026-11-10 con autorización explícita: diez permisos registrados, `phase7_verify.py` correcto, huellas de esquema/filas preservadas y `migrate --check` sin pendientes. Evidencia privada `phase7-activation-report.json`. No se ejecutaron expiraciones ni se crearon reservas reales como prueba.
2. Fase8: programar/monitorear `expirar_citas`; hoy solo existe el comando y acción privada, sin scheduler implícito. Pendientes no procesadas permanecen ocupadas de forma conservadora.
3. Escritura pública deshabilitada hasta contar con identidad verificable y política aprobada; no es un endpoint incompleto habilitado por teléfono.
4. Reembolsos reales y recaudación neta conciliada siguen siendo pendientes financieros documentados de fases anteriores. Cancelar/expirar conserva dinero e incidencia, no simula devolución.
5. TLS/proxy, aviso de privacidad real y operación productiva siguen pendientes de despliegue. No se implementaron WhatsApp, frontend o microservicios.

La suite registrada no tiene fallos críticos ni pruebas obligatorias omitidas del alcance entregado. La agenda privada quedó activada y verificada en Lasheo; la programación operativa, escritura pública verificada y pendientes financieros señalados conservan su alcance separado.
