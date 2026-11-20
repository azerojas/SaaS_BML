import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Series, money } from '../domain/analytics';
@Component({
  selector: 'bm-financial-trend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p>
      Ventas por confirmación; cobros y anticipos por su fecha de recepción. Los anticipos aplicados
      no se vuelven a sumar como ingresos.
    </p>
    @if (showChart()) {
      <p class="chart-legend">
        <span class="legend-sales">Ventas confirmadas</span
        ><span class="legend-payments">Cobros registrados</span
        ><span class="legend-advances">Anticipos recibidos</span>
      </p>
      @if (plotted().length) {
        <div
          class="trend-scroll"
          tabindex="0"
          role="region"
          aria-label="Gráfica de evolución desplazable"
        >
          <svg
            class="financial-chart"
            [attr.viewBox]="'0 0 720 ' + height()"
            role="img"
            aria-label="Evolución de ventas, cobros y anticipos. Los importes exactos están en la tabla siguiente."
          >
            @for (row of plotted(); track row.desde; let index = $index) {
              <g [attr.transform]="'translate(150,' + (index * 72 + 14) + ')'">
                <text x="-144" y="22">{{ row.desde }}</text>
                <rect x="0" y="0" [attr.width]="row.salesWidth" height="13" fill="var(--forest)" />
                <rect
                  x="0"
                  y="18"
                  [attr.width]="row.paymentsWidth"
                  height="13"
                  fill="var(--secondary)"
                />
                <rect
                  x="0"
                  y="36"
                  [attr.width]="row.advancesWidth"
                  height="13"
                  fill="var(--tertiary)"
                />
                <title>
                  {{ row.etiqueta }} · Ventas {{ money(row.ventas_confirmadas) }} · Cobros
                  {{ money(row.cobros_registrados) }} · Anticipos
                  {{ money(row.anticipos_recibidos) }}
                </title>
              </g>
            }
          </svg>
        </div>
      } @else {
        <p class="empty-panel">Sin períodos disponibles para graficar.</p>
      }
    }
    <section class="section-gap">
      <div class="analytics-table-scroll" tabindex="0" role="region" aria-label="Tabla del reporte">
        <table>
          <caption>
            Evolución completa · PEN · America/Lima
          </caption>
          <thead>
            <tr>
              <th scope="col">Desde</th>
              <th scope="col">Hasta exclusiva</th>
              <th scope="col">Ventas confirmadas</th>
              <th scope="col">Cobros registrados</th>
              <th scope="col">Anticipos recibidos</th>
            </tr>
          </thead>
          <tbody>
            @for (row of data().results; track row.desde) {
              <tr>
                <th scope="row">{{ row.desde }}</th>
                <td>{{ row.hasta }}</td>
                <td>{{ money(row.ventas_confirmadas) }}</td>
                <td>{{ money(row.cobros_registrados) }}</td>
                <td>{{ money(row.anticipos_recibidos) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section> `,
})
export class FinancialTrend {
  readonly showChart = input(true);
  readonly data = input.required<Series>();
  readonly money = money;
  // Floating point is used only for SVG geometry; never for monetary labels or accounting.
  readonly plotted = computed(() => {
    const rows = this.data().results;
    const max = Math.max(
      1,
      ...rows.flatMap((row) => [
        Number(row.ventas_confirmadas),
        Number(row.cobros_registrados),
        Number(row.anticipos_recibidos),
      ]),
    );
    return rows.map((row) => ({
      ...row,
      salesWidth: (Number(row.ventas_confirmadas) / max) * 530,
      paymentsWidth: (Number(row.cobros_registrados) / max) * 530,
      advancesWidth: (Number(row.anticipos_recibidos) / max) * 530,
    }));
  });
  readonly height = computed(() => Math.max(80, this.plotted().length * 72));
}
