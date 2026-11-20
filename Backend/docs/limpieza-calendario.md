# Limpieza del calendario local

El 19 de noviembre de 2026 el propietario solicitó vaciar todas las citas y cupos. Se archivaron 48 citas fuera de la agenda de trabajo, se cancelaron las 18 que seguían activas y se retiraron 28 configuraciones diarias y 21 horarios semanales. No había bloqueos ni solicitudes pendientes.

Se conservan las citas por su ID, sus servicios e historial, los cinco anticipos, 25 pagos, 31 ventas y 33 visitas. La limpieza no reembolsa anticipos ni altera registros financieros. Una copia cifrada previa y el informe `calendar-cleanup.json` están en la carpeta privada de operación local.

`agenda.0008_calendar_archive` agrega una tabla de soporte que excluye las citas archivadas de las listas y del calendario, conservando sus referencias y acceso al detalle con los permisos existentes. No se reinician identificadores. Las citas nuevas vuelven a aparecer normalmente y las especialistas pueden publicar nuevos cupos.

El comando local `scripts/clear_local_calendar.py` muestra un resumen sin modificar datos. `--apply` exige una copia cifrada reciente verificada, comprueba que la base sea la local `Lasheo`, aplica exclusivamente la migración de archivo y vacía la agenda en una transacción. Si cambian los datos financieros o de visitas, revierte la limpieza. No hay una acción de limpieza pública en la interfaz.
