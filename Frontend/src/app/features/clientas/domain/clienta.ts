import { Field } from '../../../shared/domain/records';
export interface Clienta {
  id: number;
  nombres: string;
  apellidos: string;
  telefono: string;
  activa: boolean;
  email?: string | null;
  fecha_nacimiento?: string | null;
  notas_privadas?: string | null;
  consentimiento_datos?: boolean;
  consentimiento_fecha?: string | null;
  creado_en?: string;
  actualizado_en?: string;
}
export function phone(value: string): string | null {
  const compact = value
    .normalize('NFKC')
    .trim()
    .replace(/[ ()-]/g, '');
  const normalized = /^9[0-9]{8}$/.test(compact) ? '+51' + compact : compact;
  if (!/^\+[1-9][0-9]{7,14}$/.test(normalized)) return null;
  return normalized.startsWith('+51') && !/^\+51(?:9[0-9]{8}|[1-8][0-9]{7})$/.test(normalized)
    ? null
    : normalized;
}
export const CLIENTA_FIELDS: readonly Field[] = [
  { key: 'nombres', label: 'Nombres', required: true, max: 120 },
  { key: 'apellidos', label: 'Apellidos', required: true, max: 120 },
  {
    key: 'telefono',
    label: 'Teléfono',
    required: true,
    max: 40,
    hint: 'Con prefijo internacional; un celular peruano de 9 dígitos se normaliza a +51.',
  },
  { key: 'email', label: 'Correo electrónico', type: 'email', max: 150 },
  { key: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date' },
  {
    key: 'notas_privadas',
    label: 'Notas privadas',
    type: 'textarea',
    max: 10000,
    hint: 'Solo personal autorizado. No escribas información innecesaria.',
  },
];
