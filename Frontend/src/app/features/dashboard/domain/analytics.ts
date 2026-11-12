export const REPORTS = [
  'overview',
  'revenue-series',
  'payment-methods',
  'top-services',
  'top-clients',
  'inventory-alerts',
  'expenses',
] as const;
export type Report = (typeof REPORTS)[number];
export type Granularity = 'day' | 'week' | 'month';
export type Preset = 'day' | 'week' | 'last7' | 'month' | 'previousmonth' | 'custom';
export interface AnalyticsFilters {
  preset: Preset;
  desde: string;
  hasta: string;
  granularidad: Granularity;
}
export interface Period {
  desde: string;
  hasta: string;
  hasta_exclusiva: true;
  timezone: 'America/Lima';
  moneda: 'PEN';
  granularidad: Granularity;
  alcance_ventas: string;
}
export interface Quality {
  recaudacion_conciliada: boolean;
  dinero_recaudado_habilitado: boolean;
  advertencias: string[];
  estado_conciliacion?: string;
}
export interface Envelope {
  periodo: Period;
  generado_en: string;
  calidad: Quality;
}
export type Metric = string | number | null;
export interface Overview extends Envelope {
  indicadores: Readonly<Record<string, Metric>>;
  definiciones: Readonly<Record<string, string>>;
  utilidad_estimada_habilitada: boolean;
  alcance_saldo: string;
}
export interface SeriesRow {
  inicio_periodo: string;
  desde: string;
  hasta: string;
  etiqueta: string;
  ventas_confirmadas: string;
  cobros_registrados: string;
  anticipos_recibidos: string;
}
export interface Series extends Envelope {
  results: SeriesRow[];
  anticipo_aplicado_es_nuevo_cobro: false;
}
export interface MethodRow {
  metodo: string;
  cobros_registrados: string;
  anticipos_recibidos: string;
  pagos_count: number;
  anticipos_count: number;
}
export interface Methods extends Envelope {
  results: MethodRow[];
  componentes_separados: true;
}
export interface ReportRow {
  [key: string]: string | number | boolean | null;
}
export interface TableReport extends Envelope {
  results: ReportRow[];
  count: number;
  total_grupos: number;
  next: string | null;
  previous: string | null;
  total?: string;
  estadisticas?: Readonly<Record<string, number>>;
  foto_actual?: boolean;
  orden_efectivo?: string;
}
export interface Comparison {
  month: string;
  timezone: 'America/Lima';
  moneda: 'PEN';
  parcial_mismo_dia: boolean;
  actual: Overview;
  anterior: Overview;
  comparacion: Readonly<
    Record<string, { diferencia: Metric; variacion_porcentaje: string | null }>
  >;
}
export const reportPermission = (report: Report) =>
  report === 'top-clients'
    ? 'reporting.view_clients'
    : report === 'inventory-alerts'
      ? 'reporting.view_inventory'
      : 'reporting.view_summary';
export const REPORT_LABELS: Readonly<Record<Report, string>> = {
  overview: 'Resumen financiero',
  'revenue-series': 'Evolución de ventas y cobros',
  'payment-methods': 'Medios de pago',
  'top-services': 'Ranking de tratamientos',
  'top-clients': 'Ranking de clientas',
  'inventory-alerts': 'Alertas de inventario',
  expenses: 'Gastos por categoría',
};
export interface Kpi {
  key: string;
  label: string;
  count?: boolean;
  description: string;
}
export const KPIS: readonly Kpi[] = [
  {
    key: 'ventas_confirmadas',
    label: 'Ventas confirmadas',
    description:
      'Ventas confirmadas en el período, incluida la propina. No equivale a dinero recibido.',
  },
  {
    key: 'cobros_registrados',
    label: 'Cobros registrados',
    description:
      'Pagos confirmados por fecha de recepción. Excluye anticipos y pagos anulados; no es caja neta.',
  },
  {
    key: 'anticipos_recibidos',
    label: 'Anticipos recibidos',
    description:
      'Dinero de anticipos confirmados por su fecha propia. Su aplicación a una venta no es otro ingreso.',
  },
  {
    key: 'dinero_recaudado',
    label: 'Caja neta conciliada',
    description:
      'Solo disponible con cierres manuales y evidencia vigente para cada día y medio. No certifica conciliación bancaria automática.',
  },
  {
    key: 'saldo_pendiente',
    label: 'Saldo pendiente actual',
    description:
      'Saldo actual de las ventas confirmadas en el período. No es deuda al cierre histórico.',
  },
  {
    key: 'costo_directo',
    label: 'Costo directo',
    description:
      'Snapshots verificados de productos y consumos reales. No vuelve a restar compras de inventario.',
  },
  {
    key: 'comisiones',
    label: 'Comisiones de atención',
    description: 'Comisiones por snapshots de las líneas. No acredita que ya se hayan pagado.',
  },
  {
    key: 'gastos_operativos',
    label: 'Gastos operativos',
    description: 'Gastos registrados por fecha del período; no incluye compras nuevamente.',
  },
  {
    key: 'utilidad_estimada',
    label: 'Utilidad operativa estimada',
    description:
      'Ingreso sin propina menos costo directo, comisiones, gastos y ajustes según el servidor. No es utilidad fiscal certificada.',
  },
  {
    key: 'propinas',
    label: 'Propinas',
    description: 'Incluidas en el total vendido; separadas de la utilidad operativa.',
  },
  {
    key: 'ajustes_comerciales',
    label: 'Ajustes comerciales',
    description: 'Ajustes registrados de las ventas del período, determinados por el servidor.',
  },
  {
    key: 'ventas_netas_ajustes',
    label: 'Ventas tras ajustes comerciales',
    description: 'Ventas confirmadas menos ajustes comerciales; no equivale a dinero recibido.',
  },
  {
    key: 'entradas_conciliadas',
    label: 'Entradas de caja conciliadas',
    description:
      'Entradas verificadas en cierres vigentes, incluidos anticipos por su fecha propia.',
  },
  {
    key: 'salidas_conciliadas',
    label: 'Devoluciones conciliadas',
    description:
      'Reembolsos verificados en los cierres del período. No se infieren de una anulación.',
  },
  {
    key: 'ticket_promedio',
    label: 'Ticket promedio',
    description:
      'Total de ventas confirmadas, incluida propina, dividido por número de ventas confirmadas.',
  },
  {
    key: 'numero_ventas',
    label: 'Ventas del período',
    count: true,
    description: 'Cantidad de ventas confirmadas, sin multiplicar sus líneas o pagos.',
  },
  {
    key: 'visitas_finalizadas',
    label: 'Visitas finalizadas',
    count: true,
    description: 'Por fecha de finalización, excluyendo citas terminales.',
  },
  {
    key: 'clientas_unicas_atendidas',
    label: 'Clientas únicas atendidas',
    count: true,
    description: 'Clientas distintas con visita finalizada en el período.',
  },
];
export function money(value: Metric | undefined): string {
  if (
    value === null ||
    value === undefined ||
    typeof value !== 'string' ||
    !/^-?\d+(?:\.\d{1,2})?$/.test(value)
  )
    return 'No disponible';
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  return (
    (negative ? '−S/ ' : 'S/ ') +
    new Intl.NumberFormat('es-PE').format(BigInt(whole)) +
    '.' +
    fraction.padEnd(2, '0')
  );
}
export function localDateTime(value: string) {
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Lima',
  }).format(new Date(value));
}
