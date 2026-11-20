export const PAYMENT_METHODS = [
  'EFECTIVO',
  'YAPE',
  'PLIN',
  'TRANSFERENCIA',
  'TARJETA',
  'OTRO',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export interface SaleLineInput {
  id?: number;
  tipo: 'SERVICIO' | 'PRODUCTO';
  servicio_id?: number;
  articulo_id?: number;
  unidad_id?: number;
  profesional_id?: number | null;
  cantidad: string;
  descuento_linea?: string;
  precio_unitario?: string;
  motivo_precio?: string;
}
export interface SaleInput {
  visita_id?: number;
  clienta_id?: number;
  lineas?: SaleLineInput[];
  descuento_global?: string;
  propina?: string;
}
export interface ConsumptionItem {
  articulo_id: number;
  unidad_id: number;
  cantidad: string;
}
export interface ConsumptionGroup {
  detalle_id: number;
  insumos: ConsumptionItem[];
}
export interface ConfirmSaleInput {
  consumos_revisados: true;
  consumos_reales: ConsumptionGroup[];
}
export interface PaymentInput {
  metodo: PaymentMethod;
  monto: string;
  referencia?: string;
  verificado_manualmente: true;
}
export interface SaleLine extends SaleLineInput {
  profesional_nombre?: string | null;
  duracion_minutos?: number | null;
  id: number;
  servicio_id: number;
  articulo_id: number;
  profesional_id: number | null;
  descripcion_snapshot: string;
  precio_unitario: string;
  descuento_linea: string;
  costo_unitario_snapshot: string;
  consumos: {
    id: number;
    articulo_id: number;
    cantidad: string;
    costo_unitario_snapshot: string;
  }[];
}
export interface Balance {
  venta_id: number;
  estado: string;
  subtotal: string;
  descuento_global: string;
  propina: string;
  total: string;
  pagos_confirmados: string;
  anticipos_aplicados: string;
  reembolsos: string;
  ajustes_comerciales: string;
  cobertura_total: string;
  saldo_pendiente: string;
  moneda: 'PEN';
}
export interface Sale {
  id: number;
  visita_id: number | null;
  clienta_id: number | null;
  estado: 'BORRADOR' | 'CONFIRMADA' | 'ANULADA';
  creada_en: string;
  confirmada_en: string | null;
  subtotal: string;
  descuento_global: string;
  propina: string;
  total: string;
}
export interface SaleDetail extends Sale {
  lineas: SaleLine[];
  saldo: Balance;
  finanzas_congeladas: {
    costo_directo: string;
    comisiones: string;
    margen_antes_gastos: string;
  } | null;
  aplicaciones_anticipo: { id: number; anticipo_id: number; monto: string; creada_en: string }[];
}
export interface SalePreview {
  venta_id: number;
  subtotal: string;
  descuento_global: string;
  propina: string;
  total: string;
  receta_sugerida: ConsumptionGroup[];
  origen_consumos: 'RECETA_ESTIMADA' | 'REAL_PROPUESTO';
  stock_consultado: {
    articulo_id: number;
    cantidad_requerida: string;
    existencia_actual: string;
    suficiente: boolean;
    costo_unitario_estimado: string | null;
  }[];
  costo_directo_estimado: string | null;
  afecta_stock: false;
}
export interface Payment {
  id: number;
  venta_id: number;
  metodo: PaymentMethod;
  monto: string;
  estado: string;
  pagado_en: string;
  referencia: string | null;
}
export interface Advance {
  id: number;
  cita_id: number;
  monto: string;
  disponible: string;
  metodo: PaymentMethod;
}
export interface Professional {
  id: number;
  nombres: string;
  apellidos: string;
  activa: boolean;
}
export interface FinanceResult {
  visita_id?: number;
  venta_id?: number;
  pago_id?: number;
  estado?: string;
}
export interface IntentResult {
  encontrado: boolean;
  operacion: string;
  resultado: FinanceResult | null;
  estado_http: number | null;
}
