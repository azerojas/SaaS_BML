# Reglas de reservas V1

Contrato detallado en [agenda-api.md](../../../docs/agenda-api.md).

- Zona Lima, `[inicio,fin)`, ISOweekday1..7. Tramos semanales sin medianoche y comienzo alineado al paso desde el inicio del tramo.
- Duración/precio se toman del servidor para1..10 servicios distintos; máximo720 minutos. Todos deben estar activos y asignados al profesional activo. Público además exige reservable_online/visible y profesional visible.
- Anticipación mínima/máxima y límite de citas activas por clienta se validan al confirmar escritura. Disponibilidad profesional no confirma ausencia de conflicto de clienta: se revalida bajo lock.
- Anticipo requerido solo si algún servicio lo exige, sobre total de la cita al porcentaje configurado. Decimal HALF_UP2. Resultado cero con servicio de precio positivo que exige anticipo bloquea política. No crea ingreso ni confirma banco.
- Crear cita produce PENDIENTE_PAGO con plazo si requiere anticipo; si no, PROGRAMADA. Confirmación financiera manual suficiente pasa a PROGRAMADA una vez; confirmar administrativamente pasa a CONFIRMADA, nunca crea dinero.
- PENDIENTE_PAGO ocupa hasta que transición real a EXPIRADA/PROGRAMADA. Deadline vencido impide confirmar dinero; expiración con parte recibida conserva anticipo/incidencia, sin devolución. Todos comparten locks financieros.
- Reprogramación preserva snapshots salvo lista explícita nueva, conserva anticipos y audita anterior/nuevo; sin cita iniciada o visita vinculada. Anticipo no supera nuevo precio. No ampliar automáticamente deadline de una pendiente existente.
- PROGRAMADA/CONFIRMADA pueden cancelar/no asistir/completar según controles; PENDIENTE_PAGO puede pagar/cancelar/expirar. Terminales no se reabren. Fuera de límite de cancelación requiere excepción/permiso. No asistencia tras fin; completar tras visita y venta coherentes.
- Desactivar profesional/quitar especialidad/cambiar horarios no deja reservas futuras huérfanas. Bloqueos con citas requieren reprogramar/cancelar primero. No anulaciones silenciosas.
- Estado de llegada no es estado de cita o pago. Enlace QR explícito por IDs de misma clienta, ventana y UNIQUE; sin teléfono.
- Espera no reserva: oferta es registro manual, conversión es reserva atómica con auditlink. Sin notificaciones automáticas.
- Token/código existentes permanecen internos; ninguna escritura pública hasta resolver identidad. No usar código de8 caracteres como secreto de autorización.
