export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Readonly<Record<string, readonly string[]>> = {},
    readonly retryAfter: number | null = null,
  ) {
    super(message);
  }
}

export function failureMessage(status: number, code: string): string {
  const agenda: Readonly<Record<string, string>> = {
    SLOT_NOT_AVAILABLE: 'El horario ya no está disponible. Consulta nuevamente y elige otro hueco.',
    DUPLICATE_WAITLIST:
      'Ya existe una solicitud de espera compatible. Revisa la lista antes de registrar otra.',
    WAITLIST_RESOLVED:
      'La solicitud de espera ya se resolvió. Consulta su estado y la cita vinculada.',
    WAITLIST_WINDOW_MISMATCH: 'El horario debe estar dentro de la fecha y franja solicitadas.',
    PROFESSIONAL_HAS_BOOKINGS: 'Resuelve las citas futuras antes de desactivar al profesional.',
    SPECIALTY_HAS_BOOKINGS: 'No se puede retirar una especialidad con citas futuras activas.',
    SCHEDULE_HAS_BOOKINGS:
      'Reprograma las citas afectadas antes de modificar o retirar este horario.',
    BLOCK_HAS_BOOKINGS: 'El bloqueo afecta citas activas. Reprograma o cancela esas citas primero.',
    APPOINTMENT_NOT_CONFIRMABLE:
      'Django exige una cita programada vigente con anticipo suficiente para confirmar.',
    ATTENTION_NOT_COMPLETED:
      'Completar exige una visita finalizada y una venta confirmada de la misma clienta.',
    NO_SHOW_TOO_EARLY: 'La inasistencia solo se registra después del final programado.',
    CANCELLATION_DEADLINE: 'La cancelación fuera de plazo requiere autorización excepcional.',
    BOOKING_OUTSIDE_WINDOW: 'La fecha está fuera del horizonte de reserva permitido por Django.',
    BOOKING_CONFIGURATION_MISSING:
      'Django todavía no tiene una configuración de reservas activa. Solicita su preparación administrativa.',
    AGENDA_NOT_ACTIVATED:
      'El backend todavía no activó los permisos de agenda. Solicita su revisión administrativa.',
    anticipo_excesivo: 'El anticipo supera el precio de la cita. Consulta los importes oficiales.',
  };
  if (agenda[code]) return agenda[code];
  if (code === 'saldo_insuficiente' || code === 'sobrepago' || code === 'monto_excede_saldo')
    return 'El monto supera el saldo disponible. Consulta el saldo oficial antes de continuar.';
  if (code === 'referencia_duplicada')
    return 'Esta referencia de pago ya está registrada. Revisa el historial y los anticipos antes de cobrar otra vez.';
  if (code === 'estado_venta')
    return 'La venta cambió de estado. Consulta su detalle antes de continuar.';
  if (code === 'clienta_no_validada')
    return 'La ficha debe estar activa y validada presencialmente.';
  if (code === 'anticipo_legacy_ambiguo' || code === 'integridad_saldo')
    return 'Django bloqueó el saldo por un conflicto de conciliación. Solicita revisión administrativa; no registres nuevos cobros.';
  if (code === 'stock_insuficiente')
    return 'No hay existencias suficientes para esta salida. Consulta el stock antes de continuar.';
  if (code === 'idempotencia_conflicto')
    return 'La clave ya identifica otra operación. Consulta el resultado antes de intentar de nuevo.';
  if (code === 'estado_compra')
    return 'La compra ya no está en borrador. Consulta su estado actual.';
  if (code === 'proveedor_inactivo')
    return 'El proveedor está inactivo. Revisa la compra antes de recibirla.';
  if (code === 'articulo_inactivo') return 'La operación requiere artículos activos.';
  if (code === 'integridad_compra' || code === 'movimiento_duplicado')
    return 'Django detectó un conflicto con los movimientos registrados. La operación requiere revisión.';
  if (code === 'telefono_duplicado') return 'Ya existe una clienta con ese teléfono.';
  if (code === 'duplicado') return 'Ya existe un registro con ese nombre, SKU, slug o código.';
  if (code === 'slug_inmutable') return 'El enlace público existente no se puede cambiar.';
  if (code === 'unidad_en_uso')
    return 'La unidad tiene referencias históricas y no puede cambiarse.';
  if (code === 'credenciales_invalidas')
    return 'No pudimos validar tu usuario y contraseña. Revisa los datos.';
  if (code === 'mfa_setup_required')
    return 'Tu cuenta necesita configurar el autenticador. Contacta a la persona administradora.';
  if (code === 'mfa_challenge_expired')
    return 'La sesión de verificación venció. Inicia sesión nuevamente con tu usuario y contraseña.';
  if (code === 'mfa_invalid') return 'El código no es válido o ha vencido. Prueba con uno nuevo.';
  if (code === 'csrf') return 'La verificación de seguridad cambió. Vuelve a intentarlo.';
  const messages: Readonly<Record<number, string>> = {
    0: 'No podemos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
    400: 'Revisa los datos del formulario e inténtalo de nuevo.',
    401: 'Necesitas iniciar sesión de nuevo.',
    403: 'Tu cuenta no tiene permiso para realizar esta acción.',
    404: 'No encontramos el recurso que buscabas.',
    409: 'La información cambió. Revisa el estado antes de continuar.',
    429: 'Hay demasiados intentos. Espera un momento antes de volver a intentar.',
    500: 'El servidor no pudo completar la solicitud. Inténtalo más tarde.',
    503: 'El servicio no está disponible por el momento. Inténtalo más tarde.',
  };
  return messages[status] ?? 'No pudimos completar la solicitud. Inténtalo de nuevo.';
}

export function validationFields(value: unknown): Readonly<Record<string, readonly string[]>> {
  const result: Record<string, readonly string[]> = Object.create(null);
  let count = 0;
  function visit(node: unknown, path: string, depth: number) {
    if (depth > 8 || count >= 1000) return;
    if (typeof node === 'string') {
      result[path || 'non_field_errors'] = [node.slice(0, 500)];
      count++;
    } else if (Array.isArray(node)) {
      if (node.every((item) => typeof item === 'string')) {
        result[path || 'non_field_errors'] = node.slice(0, 20).map((item) => item.slice(0, 500));
        count++;
      } else
        node
          .slice(0, 200)
          .forEach((item, index) =>
            visit(item, path ? path + '.' + index : String(index), depth + 1),
          );
    } else if (node && typeof node === 'object') {
      for (const [key, item] of Object.entries(node))
        visit(item, path ? path + '.' + key : key, depth + 1);
    }
  }
  visit(value, '', 0);
  return result;
}
