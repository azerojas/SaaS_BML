# Reservas online sin correo — 16 de noviembre de 2026

Decisiones vigentes del propietario: **sin anticipo, sin pasarela de pagos y sin depender de correo/SMS**. Se retiraron OTP, SMTP, cuentas de clientas y colas de correo. OCR y comprobantes electrónicos pertenecen al cobro de la atención; esta entrega no contiene un motor OCR ni emisión tributaria.

## Flujo implementado

1. La clienta abre `/reservar`, elige servicios públicos reservables, una profesional con todas las especialidades y un horario de Lima.
2. Declara nombres/teléfono y acepta el aviso de privacidad versionado. Se crea una **solicitud pendiente**, sin alta automática de clienta y sin cita confirmada.
3. El horario se retiene hasta 30 minutos por defecto, sin superar el comienzo solicitado. Se muestra claramente el vencimiento. La clienta recibe en pantalla una clave aleatoria de ocho cifras que debe guardar.
4. El personal revisa `/admin/agenda/solicitudes`, comprueba identidad y consentimiento y confirma o rechaza. Confirmar crea la cita con el precio/duración cotizados por el servidor. No exige anticipo.
5. En `/mis-reservas`, la clienta ingresa el mismo teléfono y la clave de ocho cifras para consultar solo esa solicitud, ver su nombre/estado y comprobar si aún puede cambiar o cancelar. El teléfono por sí solo no da acceso.
6. Sin confirmación dentro del plazo, la solicitud vence y deja de bloquear el horario incluso si el mantenimiento no ha corrido. Una solicitud rechazada/cancelada también libera su horario.

La clave se deriva de un token aleatorio exclusivo de cada solicitud y solo se muestra al crearla o recuperar su respuesta en la misma sesión de navegador. No se envía por SMS/correo ni se guarda en claro: la tabla conserva un HMAC para compararla y la intención idempotente conserva solo la indicación para volver a derivarla. Cada combinación de teléfono y clave abre únicamente la solicitud correspondiente; las claves incorrectas y teléfonos desconocidos reciben la misma respuesta. El acceso limita intentos por IP y teléfono. Las solicitudes antiguas conservan compatibilidad con los enlaces privados que ya se habían emitido; no se emiten enlaces nuevos.

## Reglas de negocio e integridad

- Horarios, bloqueos, especialidades, anticipación mínima/máxima y cupo de citas siguen en Django. La disponibilidad es una propuesta; se revalida al escribir.
- Las solicitudes pendientes vigentes bloquean también reservas privadas. La aprobación y ambas vías de reserva usan los mismos advisory locks, evitando que dos personas ocupen el mismo horario.
- Hasta dos solicitudes pendientes por contacto, cuotas persistentes por IP/teléfono y límites de escrituras/accesos. El teléfono se normaliza y queda explícitamente sin verificación automática.
- Una solicitud no altera una ficha existente. Al aprobar, el personal verifica los datos: se reutiliza una ficha activa con teléfono equivalente único o se crea una nueva. Duplicados y fichas QR provisionales/inactivas requieren revisión previa desde recepción.
- Confirmación y rechazo exigen `agenda.manage_appointments`; listar exige `agenda.view_agenda`. Aprobación exige confirmar identidad y consentimiento explícitamente. Todo queda auditado con responsable.
- Citas nuevas sin anticipo con `AGENDA_REQUIRE_DEPOSITS=False`. Historial financiero y anticipos anteriores se conservan.
- Pendientes: cambiar horario conserva cotización y no amplía el plazo de revisión. Confirmadas: cambio/cancelación respeta el límite configurado, sin citas iniciadas, atendidas o terminales. Se mantiene el snapshot vigente si el personal cambió servicios/profesional.
- La vista privada de agenda muestra las citas creadas. Las solicitudes aún no aprobadas se revisan desde el nuevo acceso “Solicitudes online”.

## Reintentos y privacidad

`Idempotency-Key` UUID es obligatorio para crear/cambiar/cancelar y para que el personal resuelva solicitudes. La web prepara una sesión anónima antes del formulario. Los resultados públicos se aíslan por navegador; otra sesión necesita el teléfono y la clave de esa solicitud. Se guarda en sessionStorage únicamente la referencia UUID pendiente. El cuerpo del formulario queda en RAM.

Tras perder una respuesta o recargar se consulta el resultado desde la misma sesión. Si no existe, puede completarse usando esa misma UUID. Nunca se cambia la referencia para reemplazar una operación incierta. El servidor rechaza reutilizar una clave con contenido distinto. Confirmar dos veces una misma solicitud no crea otra cita.

Las consultas públicas omiten teléfono, notas internas, contactos y credenciales de otras solicitudes. Tras autorizar una solicitud, se muestran el nombre y el estado, junto con la disponibilidad de cambios. La clave solo aparece al crear/recuperar la solicitud propia. Las respuestas API son no-store y quedan fuera de la caché PWA. Toda escritura y acceso requiere CSRF. No hay cookies ni credenciales de personal en respuestas públicas.

## Esquema y activación

Las migraciones `agenda.0002_public_booking` a `agenda.0005_public_booking_code` añaden las tablas de solicitudes/resultados idempotentes y el hash de clave de gestión con su índice. No recrean ni modifican columnas de las 34 tablas heredadas. Véase [disponibilidad diaria](agenda-disponibilidad-diaria.md). La habilitación del canal anónimo sigue dependiendo de las opciones y políticas indicadas abajo.

1. Respaldar y verificar restauración en el entorno destino. Revisar `manage.py migrate --plan` y aplicar el plan esperado con el rol propietario separado.
2. Aplicar las migraciones de agenda pendientes (`manage.py migrate agenda`). No usar `makemigrations negocio`, `flush` ni el SQL del arnés sobre una base real.
3. Con el propietario, conceder runtime SELECT/INSERT/UPDATE en `agenda_publicbookingrequest`; SELECT/INSERT en `agenda_publicbookingintent`; USAGE/SELECT en sus secuencias. Backup requiere SELECT. Preservar las restricciones append-only al restaurar. La activación local concedió estos permisos sobre los objetos nuevos; el archivo de roles preparado incluye las revocaciones para restauraciones.
4. Configurar `AGENDA_PUBLIC_WRITE_ENABLED=True`, `AGENDA_PUBLIC_READ_ENABLED=True`, `AGENDA_REQUIRE_DEPOSITS=False` y `AGENDA_REQUEST_HOLD_MINUTES=30`. Revisar el plazo con el personal: debe atender las solicitudes antes de su vencimiento.
5. Configurar el aviso HTTPS real/versionado y servir frontend/backend compatibles bajo el mismo origen HTTPS. No se necesitan cuentas de correo, claves SMTP ni SMS.
6. Habilitar `reservas_online_activas` en políticas; servicios `reservable_online/visible_catalogo`; profesionales `visible_reservas`; especialidades y horarios.
7. El mantenimiento existente marca solicitudes vencidas de forma acotada. La liberación del horario no depende de esa tarea. Conservar solicitudes/auditoría/resultados para investigación y recuperación.
8. Ensayar con datos sintéticos la solicitud y confirmación del salón, acceso con teléfono y clave desde otro dispositivo, conflictos de horario, vencimiento y recuperación de respuesta perdida.

Cerrar `AGENDA_PUBLIC_WRITE_ENABLED` impide altas nuevas y conserva la gestión de las existentes. Para revertir código, conservar las tablas y las FK; retirar la migración elimina solicitudes/resultados y requiere un respaldo y una decisión separada.

## Verificación

Las pruebas crean PostgreSQL temporal; no escriben en clientas reales. Cubren CSRF anónimo, acceso aislado por teléfono/clave/sesión, idempotencia, concurrencia pública/privada, vencimiento, permiso/confirmación del personal, cotización histórica, cambios y cancelaciones. Playwright recorre el flujo con Django real, abre la solicitud desde otra sesión, simula respuesta perdida y comprueba móvil/accesibilidad.

```powershell
cd Backend
.venv/Scripts/python.exe manage.py test --noinput
cd ../Frontend
npm run typecheck
npm run lint
npm run build
npm run e2e -- public-booking.spec.ts
```

Los controles del arnés son exclusivos de su servidor temporal y no se publican como URLs Django. No se afirma aceptación comercial remota ni funcionamiento de OCR/facturación por aprobar estas pruebas.

