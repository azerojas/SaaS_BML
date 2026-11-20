# Visitas automáticas desde el QR

El 18 de noviembre de 2026 se cambió el recorrido: la clienta escanea el QR del local, completa su teléfono o sus datos y envía el formulario. El POST registra una visita ABIERTA sin una confirmación administrativa adicional. Abrir el enlace GET no registra nada.

Las clientas existentes activas pueden enviar solo el teléfono. Una ficha nueva requiere nombres, apellidos, consentimiento explícito y la versión vigente del aviso. Se conserva la fecha y versión de la declaración; no se registra una identidad verificada por personal ni se habilitan recordatorios. Una ficha provisional del flujo anterior necesita declarar el consentimiento vigente para completar su registro. Las fichas inactivadas por administración y los teléfonos ambiguos no se activan.

La respuesta pública sigue siendo genérica, sin identidad, IDs, existencia de teléfono ni historial. Esto implica que un teléfono desconocido sin datos completos recibe la misma respuesta, pero no crea una ficha ni una visita. El formulario explica cómo completar una primera visita. Se conservan QR revocables, validaciones, límites de solicitudes y protección de los endpoints administrativos.

La transacción bloquea las escrituras compartidas de clientas y reutiliza una visita ABIERTA, incluso ante reenvíos concurrentes desde distintos puntos QR. Cuando no existe una visita abierta, crea un registro interno y su visita. Las llegadas pendientes antiguas se conservan y se asocian a la visita cuando corresponde. Una visita finalizada no se reabre: el siguiente registro crea otra visita.

La trazabilidad usa `ALTA_QR_AUTONOMA`, `ACTIVAR_ALTA_QR_AUTONOMA`, `REGISTRAR_QR_AUTOMATICO` e `INICIAR_VISITA_QR`. No inventa un actor administrativo ni afirma una comprobación presencial. Registrar una visita no crea ventas, cobros, consumos ni movimientos de inventario.

Se retiraron los accesos Llegadas y Check-in y Registrar Walk-in, los enlaces de consulta de llegadas y la creación manual desde el frontend. Las rutas antiguas de llegada y nueva visita redirigen a Visitas. Los datos históricos y las APIs administrativas anteriores se conservan. No hay migraciones ni cambios de esquema.

Verificación: pruebas de API pública, registros históricos, concurrencia y finanzas sobre PostgreSQL temporal; recorrido real del navegador desde QR hasta visita y venta, consentimiento, reenvíos y vista móvil. La activación local reconstruye la imagen del servidor y conserva la base existente; no inserta registros de prueba en ella.

Durante la activación local se detectó pendiente la migración existente `agenda.0005_public_booking_code`, ajena al registro QR. Se aplicó tras un respaldo cifrado y restauración verificada de 55 tablas. Se verificó que las 34 tablas heredadas y las reservas existentes conservaran sus datos. El servidor vuelve a responder ready con el esquema alineado.
