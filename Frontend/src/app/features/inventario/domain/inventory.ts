import { Field } from '../../../shared/domain/records';
export interface StockItem {
  articulo_id: number;
  nombre: string;
  sku: string | null;
  tipo: 'INSUMO' | 'VENTA' | 'AMBOS';
  unidad: string;
  unidad_id: number;
  categoria_id: number | null;
  categoria_nombre: string | null;
  activo: boolean;
  stock_minimo: string;
  existencia: string;
  bajo_minimo: boolean;
  tiene_movimientos: boolean;
  costo_unitario_estimado: string | null;
  politica_costeo: string;
  moneda: 'PEN';
}
export interface Movement {
  id: number;
  articulo_id: number;
  articulo_nombre: string;
  unidad: string;
  fecha: string;
  motivo: string;
  cantidad_firmada: string;
  costo_unitario: string | null;
  valoracion: string;
  compra_id: number | null;
  detalle_compra_id: number | null;
  consumo_servicio_id: number | null;
  detalle_venta_id: number | null;
  notas: string | null;
  registrado_por_id: number | null;
}
export interface InventorySummary {
  articulos_activos: number;
  bajo_minimo: number;
  agotados: number;
  sin_movimientos: number;
  ultimos_movimientos: Movement[] | null;
}
export interface RecipeUse {
  servicio_id: number;
  servicio_nombre: string;
  articulo_id: number;
  cantidad_estimada: string;
  unidad: string;
}
export interface Adjustment {
  articulo_id: number;
  unidad_id: number;
  tipo: 'AJUSTE_ENTRADA' | 'AJUSTE_SALIDA';
  cantidad: string;
  justificacion: string;
}
export interface AdjustmentResult {
  movimiento_id: number;
  articulo_id: number;
  motivo: string;
  cantidad_firmada: string;
  saldo_resultante: string;
  costo_unitario: string;
  valoracion: string;
  moneda: 'PEN';
}
export const MOVEMENT_REASONS = [
  'COMPRA',
  'AJUSTE_ENTRADA',
  'AJUSTE_SALIDA',
  'CONSUMO_SERVICIO',
  'VENTA_PRODUCTO',
  'DEVOLUCION',
] as const;
export const ADJUSTMENT_FIELDS: readonly Field[] = [
  {
    key: 'tipo',
    label: 'Tipo de ajuste',
    type: 'select',
    required: true,
    options: [
      { value: 'AJUSTE_ENTRADA', label: 'Entrada por ajuste' },
      { value: 'AJUSTE_SALIDA', label: 'Salida por ajuste' },
    ],
  },
  {
    key: 'cantidad',
    label: 'Cantidad del ajuste',
    type: 'decimal',
    scale: 3,
    required: true,
    hint: 'Mayor que cero, hasta 3 decimales.',
  },
  {
    key: 'justificacion',
    label: 'Justificación del ajuste',
    type: 'textarea',
    required: true,
    max: 1000,
    hint: 'Mínimo 8 caracteres. No incluyas datos personales innecesarios.',
  },
];
export function stockStatus(
  row: Pick<StockItem, 'tiene_movimientos' | 'existencia' | 'bajo_minimo'>,
): string {
  if (!row.tiene_movimientos) return 'Sin movimientos';
  if (/^-(?:\d)|^0(?:\.0+)?$/.test(row.existencia)) return 'Agotado';
  return row.bajo_minimo ? 'Reponer' : 'En nivel';
}
export function movementSign(value: string): string {
  return value.startsWith('-') ? 'Salida' : /^0(?:\.0+)?$/.test(value) ? 'Sin cambio' : 'Entrada';
}
export function signedQuantity(value: string): string {
  return movementSign(value) === 'Entrada' ? '+' + value : value;
}
export function dateLima(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Fecha no disponible'
    : new Intl.DateTimeFormat('es-PE', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Lima',
      }).format(date);
}
export function unitCost(value: string | null): string {
  return value === null
    ? 'Sin costo verificable'
    : new Intl.NumberFormat('es-PE', {
        style: 'currency',
        currency: 'PEN',
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }).format(Number(value));
}
