# Agenda por horas y disponibilidad de una fecha

La agenda incluye un modo **general del salón**, independiente de profesionales. `agenda.0004_shared_schedule` permite `profesional_id=null` en la tabla de soporte y agrega unicidad condicional por fecha. Enviar `{fecha,franjas}` al endpoint diario guarda esta agenda sin crear profesionales, clientas, servicios ni citas. `GET` con `ambito=general` devuelve únicamente esas fechas. Las referencias particulares existentes se conservan.

Para consultar disponibilidad de una profesional, la prioridad es: excepción particular del día, excepción general del día, horario semanal. Un día general cerrado no anula las excepciones particulares. Modificar el general protege las citas y solicitudes de las profesionales que lo heredan; restablecerlo comprueba que el horario resultante siga cubriendo las reservas existentes.

Activación local: `scripts/activate_shared_schedule_local.py --apply`, limitada a esa migración y a la base local preparada. Se ejecutó después de respaldo cifrado y restauración verificados. Se compararon sin cambios filas/esquema de las 34 tablas heredadas; el respaldo posterior también fue restaurado y verificado. No se ampliaron permisos de modificación sobre el registro de idempotencia.

En **Operación → Agenda**, las vistas diaria y semanal muestran una cuadrícula de horas, con citas según su duración y columnas por día. La vista mensual permite localizar fechas y abrir su detalle diario. El calendario usa la zona horaria de Lima.

Para configurar una jornada:

1. Seleccionar la fecha y la profesional del calendario.
2. Pulsar **Configurar día**.
3. Añadir las franjas de trabajo, por ejemplo `09:00–12:00` y `14:00–18:00`. El espacio entre ellas queda como descanso. Se admiten hasta 12 franjas.
4. Guardar disponibilidad. También se puede marcar **No atender en esta fecha** o **Usar horario habitual** para retirar la excepción.

La configuración es específica de esa profesional y fecha; prevalece sobre el horario semanal. Sin excepción se utiliza el horario semanal. Una excepción con lista vacía cierra esa fecha. Las franjas contiguas se unifican y se rechazan solapamientos. Se puede editar desde hoy hasta 366 días después, con `agenda.manage_schedules`; la lectura exige `agenda.view_agenda`.

El servidor aplica la disponibilidad tanto al consultar huecos como al reservar, reprogramar o aprobar solicitudes online. Los bloqueos, duración de servicios y demás políticas continúan vigentes. Si un cambio deja fuera una cita activa o una solicitud online pendiente vigente, se rechaza con `409 DAY_HAS_BOOKINGS`; no se cancela ni desplaza la reserva. Las escrituras están auditadas, requieren CSRF y son idempotentes.

## Contrato y activación local

- `GET /api/v1/agenda/disponibilidad-diaria/?desde=2026-11-19&hasta=2026-11-20&profesional_id=1`: rango de hasta 93 días con fin exclusivo y respuesta paginada.
- `POST /api/v1/agenda/disponibilidad-diaria/`: `{ "profesional_id": 1, "fecha": "2026-11-19", "franjas": [{ "inicio": "09:00", "fin": "18:00" }] }`.
- `POST /api/v1/agenda/disponibilidad-diaria/restablecer/`: `{ "profesional_id": 1, "fecha": "2026-11-19" }`.

La migración `agenda.0003_daily_schedule` crea únicamente la tabla de soporte `agenda_dailyschedule`, con unicidad por profesional/fecha. Depende de `0002_public_booking`. No recrea las tablas heredadas.

Activación local realizada el 16 de noviembre de 2026 mediante `scripts/activate_daily_schedule_local.py --apply`, después de respaldo cifrado y restauración verificada. Se aplicaron 0002 y 0003; se comprobaron sin cambios filas y esquema de las 34 tablas heredadas. Se concedieron permisos únicamente sobre los objetos nuevos a los roles locales de aplicación y respaldo. El respaldo posterior se restauró en una base temporal y verificó las 55 tablas, sus filas y esquema. Los informes y respaldos permanecen en la carpeta privada de operación local.

El script sin `--apply` muestra únicamente el plan. Está limitado a la base local preparada y al plan aditivo esperado; no es un migrador genérico para otros entornos. El servicio HTTPS local fue reconstruido y reiniciado con el nuevo backend. Esta activación no habilita por sí sola las reservas anónimas.

## Verificación

Las pruebas de backend cubren excepciones por fecha, cierre, retorno al horario semanal, protección de citas y solicitudes pendientes, permisos e idempotencia. Las pruebas de navegador usan Django y PostgreSQL aislados y comprueban las tres vistas, accesibilidad, edición de franjas y rechazo del cierre cuando existen citas. No se crean citas ficticias en la base operativa.
