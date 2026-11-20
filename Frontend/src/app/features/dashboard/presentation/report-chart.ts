import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DashboardTrend } from './dashboard-trend';
import { DashboardMethods } from './dashboard-methods';
import { DashboardMetrics } from './dashboard-metrics';
import { DistributionValue, ReportDistribution } from './report-distribution';
import {
  Report,
  Overview,
  Series,
  Methods,
  TableReport,
  Metric,
  money,
  REPORT_LABELS,
} from '../domain/analytics';
interface ChartValue {
  label: string;
  value: Metric;
}
interface ChartRow {
  label: string;
  values: ChartValue[];
}
@Component({
  selector: 'bm-report-chart',
  imports: [DashboardTrend, DashboardMethods, DashboardMetrics, ReportDistribution],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './report-chart.html',
  styleUrl: './report-chart.scss',
})
export class ReportChart {
  readonly report = input.required<Report>();
  readonly paymentModes = [
    { key: 'cobros_registrados' as const, label: 'Distribución de cobros' },
    { key: 'anticipos_recibidos' as const, label: 'Distribución de anticipos' },
  ];
  readonly overview = input<Overview | null>(null);
  readonly series = input<Series | null>(null);
  readonly methods = input<Methods | null>(null);
  readonly table = input<TableReport | null>(null);
  readonly labels = REPORT_LABELS;
  readonly rows = computed<ChartRow[]>(() => {
    const report = this.report();
    if (report === 'overview') {
      const data = this.overview();
      if (!data) return [];
      return [
        ['ventas_confirmadas', 'Ventas confirmadas'],
        ['cobros_registrados', 'Cobros registrados'],
        ['anticipos_recibidos', 'Anticipos recibidos'],
        ['saldo_pendiente', 'Saldo pendiente actual'],
        ['costo_directo', 'Costo directo'],
        ['gastos_operativos', 'Gastos operativos'],
        ['utilidad_estimada', 'Utilidad estimada'],
      ].map(([key, label]) => ({
        label,
        values: [{ label, value: data.indicadores[key] ?? null }],
      }));
    }
    if (report === 'revenue-series')
      return (this.series()?.results ?? []).map((row) => ({
        label: row.etiqueta,
        values: [
          { label: 'Ventas', value: row.ventas_confirmadas },
          { label: 'Cobros', value: row.cobros_registrados },
          { label: 'Anticipos', value: row.anticipos_recibidos },
        ],
      }));
    if (report === 'payment-methods')
      return (this.methods()?.results ?? []).map((row) => ({
        label: row.metodo,
        values: [
          { label: 'Cobros', value: row.cobros_registrados },
          { label: 'Anticipos', value: row.anticipos_recibidos },
        ],
      }));
    const data = this.table();
    if (!data) return [];
    if (report === 'inventory-alerts')
      return [
        ['articulos_activos', 'Artículos activos'],
        ['stock_bajo', 'Por reponer'],
        ['sin_existencia', 'Agotados'],
        ['stock_negativo', 'Existencia negativa'],
      ].map(([key, label]) => ({
        label,
        values: [{ label, value: data.estadisticas?.[key] ?? null }],
      }));
    const labelKey =
      report === 'top-services'
        ? 'descripcion_snapshot'
        : report === 'top-clients'
          ? 'nombre'
          : 'categoria';
    const valueKey =
      report === 'top-services'
        ? 'ingreso'
        : report === 'top-clients'
          ? 'ventas_confirmadas'
          : 'monto';
    return data.results.map((row) => ({
      label: String(row[labelKey] ?? 'Sin categoría'),
      values: [
        { label: '', value: typeof row[valueKey] === 'string' ? (row[valueKey] as string) : null },
      ],
    }));
  });
  readonly distributionTitle = computed(() =>
    this.report() === 'overview'
      ? 'Gráfico de dona: costos y gastos'
      : this.report() === 'expenses'
        ? 'Distribución de gastos por categoría'
        : 'Participación en las ventas',
  );
  readonly distribution = computed<DistributionValue[]>(() => {
    if (this.report() === 'overview') {
      const data = this.overview()?.indicadores;
      return [
        { label: 'Costo directo', value: data?.['costo_directo'] ?? null },
        { label: 'Comisiones', value: data?.['comisiones'] ?? null },
        { label: 'Gastos operativos', value: data?.['gastos_operativos'] ?? null },
      ];
    }
    return this.rows().map((row) => ({ label: row.label, value: row.values[0].value }));
  });
  readonly inventoryRates = computed(() => {
    const stats = this.table()?.estadisticas;
    const active = stats?.['articulos_activos'];
    return [
      { key: 'stock_bajo', label: 'Por reponer', color: 'var(--forest)' },
      { key: 'sin_existencia', label: 'Agotados', color: 'var(--secondary)' },
      { key: 'stock_negativo', label: 'Existencia negativa', color: 'var(--tertiary)' },
    ].map((item) => ({
      ...item,
      rate:
        active && stats?.[item.key] !== undefined
          ? Math.round((stats[item.key] / active) * 1000) / 10
          : null,
    }));
  });
  readonly signed = computed(() =>
    this.rows().some((row) =>
      row.values.some((item) => item.value !== null && Number(item.value) < 0),
    ),
  );
  readonly maximum = computed(() =>
    Math.max(
      1,
      ...this.rows().flatMap((row) =>
        row.values.map((item) =>
          item.value !== null && Number.isFinite(Number(item.value))
            ? Math.abs(Number(item.value))
            : 0,
        ),
      ),
    ),
  );
  isRanking() {
    return ['top-services', 'top-clients', 'expenses'].includes(this.report());
  }
  width(value: Metric) {
    return value === null || !Number.isFinite(Number(value))
      ? 0
      : (Math.abs(Number(value)) / this.maximum()) * (this.signed() ? 50 : 100);
  }
  left(value: Metric) {
    return (this.signed() ? 50 : 0) - (value !== null && Number(value) < 0 ? this.width(value) : 0);
  }
  format(value: Metric) {
    return this.report() === 'inventory-alerts'
      ? value === null
        ? 'No disponible'
        : String(value)
      : money(typeof value === 'string' ? value : null);
  }
}
