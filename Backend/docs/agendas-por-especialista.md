# Agendas por especialista

El administrador puede gestionar varias citas a la misma hora cuando pertenecen a **especialistas y clientas distintas**. Se mantiene el bloqueo de cruces para una misma especialista o para una misma clienta.

## Vista del administrador

Entrar en https://localhost:8443/admin/agenda con `operador_local`.

- La vista inicial es **Día**, con una columna fija por especialista, su nombre, color y número de citas.
- Las tarjetas muestran el nombre de la clienta, horario, estado y especialista. Se conserva el acceso al detalle y la reprogramación según permisos.
- El filtro **Especialista** permite consultar solo a una persona, también en las vistas Semana y Mes.
- La vista mensual muestra hasta tres citas por día y un botón para abrir las restantes en la vista diaria.
- Los controles de disponibilidad del salón conservan su ámbito general. Los horarios personales y las excepciones por fecha se consultan según la especialista seleccionada.
- En móvil, el calendario conserva el ancho de cada columna y se desplaza horizontalmente dentro del calendario.

Para ver citas simultáneas de demostración, seleccionar **19, 20 o 21 de noviembre de 2026**. Hay tres especialistas a las 10:00 y tres a las 14:00.

## Accesos individuales

Se crearon estas cuentas locales de demostración:

| Especialista | Usuario |
|---|---|
| Ana Demo | `ana_demo` |
| Maria Demo | `maria_demo` |
| Lucia Demo | `lucia_demo` |

Sus contraseñas y QR de autenticación están en `%USERPROFILE%/.codex/lasheo-private/local-operation/ACCESOS-ESPECIALISTAS.md`. Cada cuenta tiene su propio segundo factor. Los códigos de recuperación generados durante una verificación de acceso se guardan como `<usuario>-recovery-codes.json` en esa misma carpeta privada.

Al entrar, cada especialista llega directamente a **Mi agenda**. Puede consultar sus citas y publicar o modificar sus propios cupos mediante **Publicar mis cupos**. No puede ver agendas ajenas, las fichas completas del padrón de clientas, las solicitudes generales, los reportes financieros ni modificar citas. La gestión de citas permanece a cargo del administrador.

## Publicación de cupos y reserva de la clienta

Las horas publicadas son inicios exactos: por ejemplo **16:00, 17:00 y 18:00**. No se generan horas intermedias. El editor diferencia **Hora de la cita** y **Fin máximo del servicio**; este último solo limita qué duración cabe en el cupo. La publicación del administrador para una especialista con agenda propia conserva los cupos contiguos separados. Las agendas personales antiguas también se interpretan como cupos con un único inicio. Las vistas Día, Semana y Mes muestran los cupos personales en lugar de sustituirlos por el horario general del salón.

1. La especialista selecciona una fecha y publica cupos independientes, por ejemplo **14:00–16:00**, **16:00–18:00** y **18:00–20:00**. La reserva solo puede comenzar a las 14:00, 16:00 o 18:00. La hora final indica cuánto tiempo tiene disponible para atender y limita la duración del servicio.
   Para las cuentas que publican sus propios cupos, una fecha sin publicación queda cerrada: no hereda automáticamente horarios generales ni jornadas semanales.
2. Publicar cupos no crea citas, clientas, visitas, ventas ni pagos. Cada cupo admite una sola reserva, aunque el servicio dure menos que la ventana completa.
3. Desde https://localhost:8443/catalogo, la clienta pulsa **Reservar cita**, elige la especialista y consulta la fecha. El servicio del catálogo queda seleccionado automáticamente.
4. Consultar o seleccionar un horario no lo ocupa. **Enviar la solicitud de reserva** lo retiene para esa clienta y lo oculta del listado disponible para otras. Se conserva la confirmación del salón; la solicitud pendiente tiene el vencimiento configurado.
5. Una cancelación o el vencimiento de una solicitud pendiente libera el cupo. Dos solicitudes simultáneas no pueden consumir el mismo cupo, y una especialista no puede retirar un cupo que deje citas o solicitudes vigentes sin cobertura.

La demostración tiene cupos libres a las **14:00, 16:00 y 18:00 del 22 al 25 de noviembre de 2026** para las tres especialistas. Para probarlos, elegir un servicio de hasta 120 minutos, por ejemplo **Lifting de pestañas**, de 60 minutos. Los días 19 al 21 conservan las citas de demostración existentes, con los cupos de las 10:00 y 14:00 ocupados.

## Aplicación de los permisos

- `agenda.view_agenda`: conserva el acceso general existente del administrador y personal autorizado.
- `agenda.view_own_agenda`: nuevo permiso de consulta individual. No se combina con el permiso general en las cuentas de especialistas.
- `agenda.manage_own_schedule`: permite publicar únicamente los cupos de la especialista vinculada. La API fuerza su identidad e impide escribir horarios generales o ajenos.
- `publicacion_propia` identifica en la respuesta de profesionales a las especialistas que deben publicar sus cupos por fecha; permite mostrar su disponibilidad real en las columnas del administrador.
- La cuenta debe estar vinculada por `Profesionales.usuario` a una especialista activa. Sin vínculo o con especialista inactiva, la consulta se rechaza.
- La API aplica la restricción antes de paginar. Cambiar `profesional_id`, `clienta_id` o un ID de cita no permite acceder a otras agendas. El detalle ajeno devuelve 404.
- Las cuentas individuales admiten lectura de su agenda y escritura de sus propios cupos por fecha. No basta con ocultar filtros o botones en Angular.
- Las respuestas de citas incluyen `clienta_nombre` y `servicios_nombres` para presentar información legible sin conceder acceso al padrón general de clientas o al catálogo administrativo.

Las migraciones `agenda.0006_own_agenda_permission` y `agenda.0007_own_schedule_permission` añaden permisos al estado del modelo proxy; no alteran las tablas de negocio. El indicador `cupo_unico` se conserva dentro del JSON existente de franjas, y `ocupado` se calcula al consultar.

## Aprovisionamiento local de demostración

Desde `Backend`, para revisar las cuentas que se crearían:

```powershell
.venv/Scripts/python.exe -X utf8 scripts/provision_demo_specialists.py
```

Para aplicarlo después de la migración:

```powershell
.venv/Scripts/python.exe -X utf8 manage.py migrate agenda 0007_own_schedule_permission
.venv/Scripts/python.exe -X utf8 scripts/provision_demo_specialists.py --apply
```

El script se limita a la base local `Lasheo` y a las tres especialistas del manifiesto de demostración. No reemplaza cuentas, contraseñas, vínculos ni autenticadores existentes. La clave de cifrado se obtiene del entorno local privado y nunca se copia al repositorio.

Para incorporar una especialista real, el administrador debe crear una cuenta de personal con los permisos de agenda propia y publicación de cupos, vincularla a su ficha de profesional y aprovisionar su segundo factor por el procedimiento existente `mfa_provision`. No se debe conceder el permiso de agenda general a una cuenta individual.
