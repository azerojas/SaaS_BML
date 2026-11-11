export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
export type Query = Readonly<Record<string, string | number>>;
export type Value = string | boolean;
export interface Choice {
  value: string;
  label: string;
}
export interface Field {
  key: string;
  label: string;
  type?:
    'text' | 'email' | 'date' | 'datetime-local' | 'textarea' | 'checkbox' | 'select' | 'decimal';
  required?: boolean;
  max?: number;
  scale?: number;
  options?: readonly Choice[];
  hint?: string;
  readonly?: boolean;
}
export interface PresentationConfig {
  privacy_notice: { version: string; url: string };
  image_allowed_hosts: string[];
}
export const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'No pudimos completar la operación.';
export function safeHttps(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443')
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function decimalValid(
  value: unknown,
  scale: number,
  integerDigits = 10,
  positive = false,
): boolean {
  if (
    typeof value !== 'string' ||
    !new RegExp('^\\d{1,' + integerDigits + '}(?:\\.\\d{1,' + scale + '})?$').test(value)
  )
    return false;
  return !positive || /[1-9]/.test(value);
}
export function safeNotice(value: string | undefined, origin: string): string | null {
  try {
    const url = new URL(value ?? '');
    if (url.protocol === 'https:' && url.origin === origin && !url.username && !url.password)
      return url.href;
  } catch {
    return null;
  }
  return safeHttps(value);
}
export function pen(value: string): string {
  if (!decimalValid(value, 2)) return 'Precio no disponible';
  // Formatting only: decimal payloads and financial decisions stay on the server.
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(
    Number(value),
  );
}
