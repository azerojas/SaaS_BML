import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TableReport, money } from '../domain/analytics';
import { ReportTable } from './report-table';

@Component({
  selector: 'bm-dashboard-ranking',
  host: { '[attr.data-report]': 'report()' },
  imports: [ReportTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="ranking-caption">
      {{
        report() === 'top-services'
          ? 'Tratamientos con mayor ingreso tras descuentos.'
          : report() === 'top-clients'
            ? 'Clientas con ventas confirmadas en el período.'
            : 'Gastos registrados por categoría en el período.'
      }}
    </p>
    @if (report() === 'top-services') {
      <div
        class="service-table-scroll"
        role="region"
        tabindex="0"
        aria-label="Tratamientos e importes del período"
      >
        <table class="service-table">
          <thead>
            <tr>
              <th scope="col">Tratamiento</th>
              <th scope="col">Ventas</th>
              <th scope="col">Ingresos</th>
              <th scope="col">Costo directo</th>
              <th scope="col">Comisiones</th>
            </tr>
          </thead>
          <tbody>
            @for (row of data().results; track $index) {
              <tr>
                <th scope="row">{{ row['descripcion_snapshot'] }}</th>
                <td>{{ row['numero_ventas'] ?? 'No disponible' }}</td>
                <td>
                  <strong>{{ amount(row['ingreso']) }}</strong>
                </td>
                <td>{{ amount(row['costo_directo']) }}</td>
                <td>{{ amount(row['comisiones']) }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5">No hay tratamientos vendidos en estas fechas.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="ranking-scope">
        {{ data().results.length }} tratamientos mostrados · {{ data().total_grupos }} en el período
      </p>
    } @else {
      @if (data().total; as total) {
        <div class="expense-total">
          <span>Total de gastos registrados</span><strong>{{ money(total) }}</strong>
        </div>
      }
      <div class="rank-list">
        @for (row of rows(); track $index; let index = $index) {
          <div class="rank-row">
            <span class="rank-number">{{
              report() === 'top-clients' ? initials(row.label) : index + 1
            }}</span>
            <div class="rank-content">
              <div>
                <span>{{ row.label }}</span
                ><strong>{{ money(row.value) }}</strong>
              </div>
              <div class="rank-track" aria-hidden="true">
                <span [style.width.%]="row.width"></span>
              </div>
            </div>
          </div>
        } @empty {
          <div class="ranking-empty">
            {{
              report() === 'top-services'
                ? 'Los tratamientos aparecerán al confirmar ventas en este período.'
                : report() === 'top-clients'
                  ? 'No hay clientas con ventas en estas fechas.'
                  : 'No hay gastos registrados en estas fechas.'
            }}
          </div>
        }
      </div>
    }
    <details>
      <summary>Ver registros e importes exactos</summary>
      <bm-report-table [report]="report()" [data]="data()" />
    </details>`,
  styleUrl: './dashboard-ranking.scss',
})
export class DashboardRanking {
  readonly data = input.required<TableReport>();
  readonly report = input<'top-services' | 'expenses' | 'top-clients'>('top-services');
  readonly money = money;
  amount(value: unknown) {
    return money(typeof value === 'string' ? value : null);
  }
  initials(label: string) {
    return (
      label
        .match(/\p{L}+/gu)
        ?.slice(0, 2)
        .map((word) => word[0].toUpperCase())
        .join('') || '·'
    );
  }
  readonly rows = computed(() => {
    const metric =
      this.report() === 'top-services'
        ? 'ingreso'
        : this.report() === 'top-clients'
          ? 'ventas_confirmadas'
          : 'monto';
    const name =
      this.report() === 'top-services'
        ? 'descripcion_snapshot'
        : this.report() === 'top-clients'
          ? 'nombre'
          : 'categoria';
    const max = Math.max(
      1,
      ...this.data()
        .results.map((row) => Number(row[metric]))
        .filter(Number.isFinite),
    );
    return this.data().results.map((row) => ({
      label: String(row[name] ?? 'Sin nombre'),
      value: typeof row[metric] === 'string' ? row[metric] : null,
      width: Number.isFinite(Number(row[metric]))
        ? Math.max(0, (Number(row[metric]) / max) * 100)
        : 0,
    }));
  });
}
