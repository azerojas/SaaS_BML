import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Overview, Methods, money } from '../domain/analytics';
import { PaymentMethods } from './payment-methods';

@Component({
  selector: 'bm-dashboard-methods',
  imports: [PaymentMethods],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="method-toolbar">
      @if (summary(); as totals) {
        <span
          class="reconciliation-badge"
          [class.pending]="!totals.calidad.recaudacion_conciliada"
          >{{
            totals.calidad.recaudacion_conciliada ? 'Caja conciliada' : 'Caja por revisar'
          }}</span
        >
      }
    </div>
    <div
      class="donut"
      [style.background]="gradient()"
      role="img"
      [attr.aria-label]="
        mode() === 'cobros_registrados'
          ? 'Distribución de cobros registrados por medio de pago'
          : 'Distribución de anticipos recibidos por medio de pago'
      "
    >
      <div>
        @if (total(); as value) {
          <span>{{
            mode() === 'cobros_registrados' ? 'Total de cobros' : 'Anticipos recibidos'
          }}</span
          ><strong class="donut-amount">{{ value }}</strong
          ><small
            >{{ used() }}
            {{ used() === 1 ? 'medio con movimientos' : 'medios con movimientos' }}</small
          >
        } @else {
          <strong>{{ used() }}</strong
          ><span>{{ used() ? 'medios con movimientos' : 'Sin movimientos' }}</span>
        }
      </div>
    </div>
    <div class="method-list">
      @for (row of data().results; track row.metodo; let index = $index) {
        <div>
          <span class="method-identity"
            ><i [style.background]="colors[index % colors.length]"></i
            ><span
              >{{ row.metodo
              }}<small
                >{{
                  mode() === 'cobros_registrados' ? row.pagos_count : row.anticipos_count
                }}
                registros</small
              ></span
            ></span
          ><strong
            >{{ money(row[mode()]) }}<small>{{ share(index) }}</small></strong
          >
        </div>
      } @empty {
        <p>No hay cobros ni anticipos en estas fechas.</p>
      }
    </div>
    @if (summary(); as totals) {
      <div class="cash-status">
        <span>Caja neta del período</span
        ><strong>{{
          money(
            totals.calidad.dinero_recaudado_habilitado
              ? totals.indicadores['dinero_recaudado']
              : null
          )
        }}</strong>
      </div>
    }
    <p class="method-note">Cobros y anticipos se consultan por separado.</p>
    @if (showDetail()) {
      <section class="chart-detail">
        <h3>Desglose por medio de pago</h3>
        <bm-payment-methods [data]="data()" />
      </section>
    }`,
  styleUrl: './dashboard-methods.scss',
})
export class DashboardMethods {
  readonly data = input.required<Methods>();
  readonly showDetail = input(true);
  readonly summary = input<Overview | null>(null);
  readonly total = computed(() => {
    const value = this.summary()?.indicadores[this.mode()];
    return typeof value === 'string' ? money(value) : null;
  });
  share(index: number) {
    const values = this.data().results.map((row) => Math.max(0, Number(row[this.mode()])));
    const total = values.reduce((sum, value) => sum + value, 0);
    return (
      new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 }).format(
        total ? (values[index] / total) * 100 : 0,
      ) + ' %'
    );
  }
  readonly money = money;
  readonly mode = input<'cobros_registrados' | 'anticipos_recibidos'>('cobros_registrados');
  readonly colors = [
    'var(--forest)',
    'var(--secondary)',
    'var(--tertiary)',
    'var(--outline)',
    'var(--primary-container)',
    'var(--secondary-line)',
  ];
  readonly used = computed(
    () => this.data().results.filter((row) => Number(row[this.mode()]) > 0).length,
  );
  readonly gradient = computed(() => {
    // Numbers are used for geometry only; amounts above remain exact server strings.
    const values = this.data().results.map((row) => Math.max(0, Number(row[this.mode()])));
    const total = values.reduce((sum, value) => sum + value, 0);
    if (!total) return 'conic-gradient(var(--surface-high) 0deg 360deg)';
    let start = 0;
    const stops = values.map((value, index) => {
      const end = start + (value / total) * 360;
      const stop = `${this.colors[index % this.colors.length]} ${start}deg ${end}deg`;
      start = end;
      return stop;
    });
    return `conic-gradient(${stops.join(',')})`;
  });
}
