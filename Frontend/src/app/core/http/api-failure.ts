export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Readonly<Record<string, readonly string[]>> = {},
  ) {
    super(message);
  }
}

export function failureMessage(status: number, code: string): string {
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
