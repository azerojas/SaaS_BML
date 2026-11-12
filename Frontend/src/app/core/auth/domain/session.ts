export interface CurrentUser {
  readonly id: number;
  readonly username: string;
  readonly nombre: string;
  readonly is_staff: boolean;
  readonly permissions: readonly string[];
}

export type AuthState = 'unknown' | 'loading' | 'authenticated' | 'anonymous';
export interface MfaChallenge {
  readonly mfa_required: true;
  readonly setup_confirmation_required: boolean;
}
export interface MfaResult {
  readonly mfa_verified: true;
  readonly recovery_codes?: readonly string[];
}

export function canAccess(user: CurrentUser | null, permission: string): boolean {
  return !!user?.is_staff && user.permissions.includes(permission);
}

export function safeReturnUrl(value: string | null | undefined): string {
  const allowed =
    /^\/admin(?:\/(?:clientas(?:\/(?:nueva|[1-9]\d*(?:\/editar)?))?|catalogo(?:\/(?:servicios|articulos|categorias-servicio|categorias-articulo|unidades)(?:\/(?:nuevo|[1-9]\d*(?:\/editar)?))?)?|inventario(?:\/(?:articulos\/[1-9]\d*|movimientos|alertas|ajustes\/nuevo))?|compras(?:\/(?:nueva|[1-9]\d*(?:\/(?:editar|recepcion))?))?|proveedores(?:\/(?:nuevo|[1-9]\d*))?|visitas|reportes|agenda|acceso-denegado))?$/;
  const phase4 =
    /^\/admin\/(?:llegadas(?:\/[1-9]\d*)?|puntos-qr|visitas(?:\/(?:nueva|[1-9]\d*))?|ventas(?:\/(?:nueva|[1-9]\d*(?:\/editar)?))?)$/;
  const phase6 =
    /^\/admin\/agenda(?:\/(?:profesionales|bloqueos|configuracion|citas\/(?:nueva|[1-9]\d*)|lista-espera(?:\/[1-9]\d*)?))?$/;
  return value && (allowed.test(value) || phase4.test(value) || phase6.test(value))
    ? value
    : '/admin';
}

export function isCurrentUser(value: unknown): value is CurrentUser {
  if (!value || typeof value !== 'object') return false;
  const user = value as Partial<CurrentUser>;
  return (
    Number.isInteger(user.id) &&
    typeof user.username === 'string' &&
    typeof user.nombre === 'string' &&
    user.is_staff === true &&
    Array.isArray(user.permissions) &&
    user.permissions.every((permission: unknown) => typeof permission === 'string')
  );
}
