import { decimalValid } from '../../../shared/domain/records';
export interface PurchaseLine {
  id: number;
  articulo_id: number;
  articulo_nombre: string;
  unidad_id: number;
  unidad: string;
  cantidad: string;
  costo_unitario: string;
  numero_lote: string | null;
  vencimiento: string | null;
}
export interface Purchase {
  id: number;
  proveedor_id: number | null;
  proveedor_nombre: string | null;
  numero_documento: string | null;
  fecha: string;
  estado: 'BORRADOR' | 'RECIBIDA' | 'ANULADA';
  total: string;
  moneda: 'PEN';
  observaciones?: string | null;
  detalles?: PurchaseLine[];
}
export interface PurchaseLineInput {
  articulo_id: number;
  unidad_id: number;
  cantidad: string;
  costo_unitario: string;
  numero_lote: string | null;
  vencimiento: string | null;
}
export interface PurchaseInput {
  proveedor_id: number | null;
  numero_documento: string | null;
  observaciones: string;
  detalles: PurchaseLineInput[];
  fecha?: string;
}
export function purchaseTimestamp(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(value + ':00-05:00');
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
export function limaDateInput(value: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return (
    values['year'] +
    '-' +
    values['month'] +
    '-' +
    values['day'] +
    'T' +
    values['hour'] +
    ':' +
    values['minute']
  );
}
export function estimatedTotal(
  rows: readonly Pick<PurchaseLineInput, 'cantidad' | 'costo_unitario'>[],
): string | null {
  let total = 0n;
  const scaled = (value: string, scale: number) => {
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole + fraction.padEnd(scale, '0'));
  };
  for (const row of rows) {
    if (!decimalValid(row.cantidad, 3, 11, true) || !decimalValid(row.costo_unitario, 4, 8))
      return null;
    total += scaled(row.cantidad, 3) * scaled(row.costo_unitario, 4);
  }
  const cents = (total + 50000n) / 100000n;
  if (cents > 999999999999n) return null;
  return (cents / 100n).toString() + '.' + (cents % 100n).toString().padStart(2, '0');
}
