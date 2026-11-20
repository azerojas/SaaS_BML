import { afterNextRender, ElementRef, DestroyRef, inject } from '@angular/core';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { Overview, Series, money } from '../domain/analytics';
import { FinancialTrend } from './financial-trend';

@Component({
  selector: 'bm-dashboard-trend',
  imports: [FinancialTrend],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="chart-description">Ventas y dinero recibido a lo largo del período · PEN</p>
    <div class="line-legend" role="group" aria-label="Series del gráfico">
      @for (item of series; track item.key) {
        <span class="legend-item" [class.inactive]="active() !== 'all' && active() !== item.key">
          <i [style.background]="item.color"></i
          ><span
            >{{ item.label }}
            @if (summary(); as totals) {
              <strong>{{ money(totals.indicadores[item.key]) }}</strong>
            }
          </span>
        </span>
      }
    </div>
    @if (points().length) {
      <div class="plot">
        <svg
          [attr.viewBox]="'0 0 ' + width() + ' 280'"
          role="img"
          aria-label="Evolución de ventas, cobros y anticipos del período. Consulta los importes exactos en el detalle."
        >
          @for (tick of ticks(); track $index) {
            <line
              x1="58"
              [attr.x2]="width() - 16"
              [attr.y1]="tick.y"
              [attr.y2]="tick.y"
              stroke="var(--line)"
              stroke-dasharray="3 5"
            />
            <text x="48" [attr.y]="tick.y + 4" text-anchor="end">{{ tick.label }}</text>
          }
          @if (
            chartMode() === 'lines' && (active() === 'all' || active() === 'ventas_confirmadas')
          ) {
            <path [attr.d]="area()" fill="var(--sage)" opacity=".35" />
          }
          @for (item of series; track item.key) {
            @if (active() === 'all' || active() === item.key) {
              @if (chartMode() === 'lines' || item.key === 'anticipos_recibidos') {
                <path
                  [attr.d]="path(item.key)"
                  fill="none"
                  [attr.stroke]="item.color"
                  stroke-width="2.5"
                  [attr.stroke-dasharray]="chartMode() === 'bars' ? '5 5' : null"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                @for (point of points(); track point.row.desde) {
                  <circle
                    [attr.cx]="point.x"
                    [attr.cy]="y(point.row[item.key])"
                    r="3"
                    [attr.fill]="item.color"
                  >
                    <title>
                      {{ point.row.etiqueta }} · {{ item.label }}: {{ money(point.row[item.key]) }}
                    </title>
                  </circle>
                }
              } @else {
                @for (point of points(); track point.row.desde) {
                  <rect
                    class="revenue-bar"
                    [attr.data-series]="item.key"
                    [attr.x]="
                      point.x +
                      (active() === 'all'
                        ? item.key === 'ventas_confirmadas'
                          ? -barWidth() - 1
                          : 1
                        : -barWidth() / 2)
                    "
                    [attr.y]="barTop(point.row[item.key])"
                    [attr.width]="barWidth()"
                    [attr.height]="barHeight(point.row[item.key])"
                    rx="3"
                    [attr.fill]="item.color"
                  >
                    <title>
                      {{ point.row.etiqueta }} · {{ item.label }}: {{ money(point.row[item.key]) }}
                    </title>
                  </rect>
                }
              }
            }
          }
          @for (point of labels(); track point.row.desde) {
            <text [attr.x]="point.x" y="266" text-anchor="middle">
              {{ shortDate(point.row.desde) }}
            </text>
          }
        </svg>
      </div>
      @if (empty()) {
        <p class="chart-empty">
          Aún no hay movimientos en este período. Aquí aparecerá su evolución.
        </p>
      }
    } @else {
      <p class="chart-empty">No hay períodos disponibles para graficar.</p>
    }
    @if (peak(); as row) {
      <div class="chart-insight">
        <span>Período con más ventas</span
        ><strong>{{ row.etiqueta }} · {{ money(row.ventas_confirmadas) }}</strong>
      </div>
    }
    @if (showDetail()) {
      <section class="chart-detail">
        <h3>Importes y detalle de la evolución</h3>
        <bm-financial-trend [data]="data()" [showChart]="false" />
      </section>
    }`,
  styleUrl: './dashboard-trend.scss',
})
export class DashboardTrend {
  readonly width = signal(720);
  constructor() {
    const host = inject(ElementRef<HTMLElement>);
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const observer = new ResizeObserver(([entry]) =>
        this.width.set(Math.max(240, entry.contentRect.width)),
      );
      observer.observe(host.nativeElement);
      destroy.onDestroy(() => observer.disconnect());
    });
  }
  readonly data = input.required<Series>();
  readonly showDetail = input(true);
  readonly summary = input<Overview | null>(null);
  readonly chartMode = input<'bars' | 'lines'>('bars');
  readonly barWidth = computed(() =>
    Math.min(24, Math.max(2, ((this.width() - 74) / Math.max(1, this.points().length)) * 0.26)),
  );
  barTop(value: string) {
    return Math.min(this.y(value), this.y('0'));
  }
  barHeight(value: string) {
    return Math.abs(this.y(value) - this.y('0'));
  }
  readonly peak = computed(() =>
    this.data().results.reduce<Series['results'][number] | null>(
      (max, row) =>
        Number(row.ventas_confirmadas) > 0 &&
        (!max || Number(row.ventas_confirmadas) > Number(max.ventas_confirmadas))
          ? row
          : max,
      null,
    ),
  );
  readonly money = money;
  readonly active = input<
    'all' | 'ventas_confirmadas' | 'cobros_registrados' | 'anticipos_recibidos'
  >('all');
  readonly series = [
    { key: 'ventas_confirmadas' as const, label: 'Ventas', color: 'var(--forest)' },
    { key: 'cobros_registrados' as const, label: 'Cobros', color: 'var(--secondary)' },
    { key: 'anticipos_recibidos' as const, label: 'Anticipos', color: 'var(--tertiary)' },
  ];
  readonly range = computed(() => {
    const values = this.data()
      .results.flatMap((row) => this.series.map((s) => Number(row[s.key])))
      .filter(Number.isFinite);
    return { min: Math.min(0, ...values), max: Math.max(1, ...values) };
  });
  readonly points = computed(() =>
    this.data().results.map((row, index, rows) => ({
      row,
      x:
        this.chartMode() === 'bars'
          ? 58 + ((index + 0.5) / rows.length) * (this.width() - 74)
          : rows.length === 1
            ? (this.width() + 42) / 2
            : 58 + (index / (rows.length - 1)) * (this.width() - 74),
    })),
  );
  readonly labels = computed(() =>
    this.points().filter(
      (_, i, rows) =>
        i === 0 ||
        i === rows.length - 1 ||
        i % Math.max(1, Math.ceil(rows.length / (this.width() < 480 ? 3 : 6))) === 0,
    ),
  );
  readonly empty = computed(() =>
    this.data().results.every((row) => this.series.every((s) => Number(row[s.key]) === 0)),
  );
  readonly ticks = computed(() =>
    Array.from({ length: 5 }, (_, index) => {
      const value = this.range().min + ((this.range().max - this.range().min) * index) / 4;
      return {
        y: this.y(String(value)),
        label: new Intl.NumberFormat('es-PE', {
          notation: 'compact',
          maximumFractionDigits: 1,
        }).format(value),
      };
    }),
  );
  y(value: string) {
    return 228 - ((Number(value) - this.range().min) / (this.range().max - this.range().min)) * 204;
  }
  path(key: 'ventas_confirmadas' | 'cobros_registrados' | 'anticipos_recibidos') {
    return this.points()
      .map((p, i) => `${i ? 'L' : 'M'}${p.x},${this.y(p.row[key])}`)
      .join(' ');
  }
  readonly area = computed(() => {
    const points = this.points();
    return points.length
      ? this.path('ventas_confirmadas') +
          ` L${points.at(-1)!.x},${this.y('0')} L${points[0].x},${this.y('0')} Z`
      : '';
  });
  shortDate(date: string) {
    return new Intl.DateTimeFormat('es-PE', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(date + 'T12:00:00Z'));
  }
}
