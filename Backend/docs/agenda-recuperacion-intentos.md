# Recuperar un intento pendiente de agenda

Si un formulario muestra una operación anterior pendiente, pulsar **Resolver operación pendiente**. El servidor devuelve el resultado si ya se guardó. Si no existe resultado, cierra la clave anterior y permite guardar de nuevo. Cerrar el intento no cancela citas ni anticipos existentes.

`POST /api/v1/agenda/intentos/{uuid}/resolver/` recibe exclusivamente `{"operacion":"agenda.horario.crear"}` (u otra operación admitida por la consulta de intentos). Exige sesión staff, MFA, CSRF, permiso de agenda y permiso de la acción. La búsqueda y el cierre están limitados al actor autenticado.

La resolución adquiere el mismo advisory lock transaccional que las mutaciones. Si la escritura terminó, devuelve su respuesta. Si no, inserta un registro inmutable con un hash que ningún payload SHA-256 puede igualar. Una petición original retrasada se rechaza por conflicto de idempotencia; nunca se borra una clave para desbloquear el formulario. Repetir la resolución es seguro, incluso si se pierde su respuesta. No hay migraciones ni cambios de esquema.

El frontend conserva únicamente UUID, ruta, método y huella del formulario en sessionStorage. Resolver no requiere recuperar nombres, notas ni otros datos del formulario original. Si falla la resolución, conserva la clave y el bloqueo.

La consulta del registro dentro de las mutaciones usa SELECT normal bajo el advisory lock compartido. No utiliza SELECT FOR UPDATE: PostgreSQL exige permiso UPDATE para ese bloqueo de fila y el runtime tiene deliberadamente revocado ese permiso en idempotency_records. Mantener ambos bloqueos provocaba errores 500 al crear profesionales y otras operaciones. La prueba con propietario no superusuario revoca UPDATE/DELETE dentro de la transacción de prueba, guarda y reenvía una profesional y su horario, y verifica que modificar o borrar los registros sigue prohibido.

En localhost, 127.0.0.1 y ::1 se desactiva el registro del service worker: la CA privada local puede no estar instalada como confiable en el navegador, lo que provoca NG05604. Los despliegues fuera de loopback conservan el registro de producción.

Verificación: pruebas aisladas de cierre/reintento tardío, recuperación sin duplicar, permisos y carrera entre resolución y escritura; pruebas del estado frontend y recorrido Playwright de cierre seguido de guardado de horario. No se crean horarios de prueba en la base operativa.
