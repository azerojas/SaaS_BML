import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Overview, KPIS, Metric, money } from '../domain/analytics';
@Component({
  selector: 'bm-kpi-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="analytics-kpis">
      @for (kpi of kpis; track kpi.key) {
        <article class="kpi-card">
          <h3>{{ kpi.label }}</h3>
          <p class="kpi-value" [attr.data-testid]="'kpi-' + kpi.key">
            {{ value(data().indicadores[kpi.key], kpi.count) }}
          </p>
          <p>{{ kpi.description }}</p>
          @if (data().indicadores[kpi.key] === null) {
            <span class="badge">Pendiente de verificación o conciliación</span>
          }
          @if (data().definiciones[kpi.key]; as definition) {
            <details>
              <summary>Ver criterio del reporte</summary>
              <p>{{ definition }}</p>
            </details>
          }
        </article>
      }
    </div>
    @if (showEmpty() && data().indicadores['numero_ventas'] === 0) {
      <p class="empty-panel" role="status">
        Sin ventas confirmadas en este período. Los cobros de otras fechas y anticipos se muestran
        por separado si existen.
      </p>
    }`,
})
export class KpiGrid {
  readonly showEmpty = input(true);
  readonly data = input.required<Overview>();
  readonly kpis = KPIS;
  value(value: Metric | undefined, count = false) {
    return count ? (typeof value === 'number' ? String(value) : 'No disponible') : money(value);
  }
}
