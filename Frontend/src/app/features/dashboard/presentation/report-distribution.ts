import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Metric, money } from '../domain/analytics';

export interface DistributionValue {
  label: string;
  value: Metric;
}

@Component({
  selector: 'bm-report-distribution',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="distribution">
      <div
        class="donut"
        role="img"
        [attr.aria-label]="'Gráfico de dona: ' + title()"
        [style.background]="gradient()"
      >
        <div>
          <strong>{{ invalid() ? '—' : total() > 0 ? entries().length : 0 }}</strong
          ><span>{{
            invalid() ? 'No disponible' : total() > 0 ? 'categorías' : 'Sin movimientos'
          }}</span>
        </div>
      </div>
      <ul>
        @for (item of entries(); track $index) {
          <li>
            <i [style.background]="colors[$index % colors.length]"></i>
            <span
              >{{ item.label }}<small>{{ format(item.value) }}</small></span
            >
            <strong>{{ share(item.value) }}</strong>
          </li>
        }
      </ul>
    </div>
    @if (invalid() || total() <= 0) {
      <p class="empty-panel">
        {{
          invalid()
            ? 'La distribución requiere todos los importes disponibles y sin valores negativos. Consulta el gráfico de barras.'
            : 'Sin movimientos para mostrar la distribución.'
        }}
      </p>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .distribution {
      display: grid;
      gap: 24px;
    }
    .donut {
      width: min(260px, 100%);
      aspect-ratio: 1;
      margin: 8px auto;
      border-radius: 50%;
      display: grid;
      place-items: center;
    }
    .donut > div {
      width: 73%;
      aspect-ratio: 1;
      border-radius: 50%;
      background: var(--paper);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .donut strong {
      font-size: 2rem;
    }
    .donut span,
    small {
      color: var(--muted);
      font-size: 0.875rem;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      max-height: 340px;
      overflow-y: auto;
    }
    li {
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid var(--line);
      font-size: 0.875rem;
    }
    li span {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    small {
      display: block;
      margin-top: 4px;
    }
    i {
      width: 10px;
      height: 10px;
      flex-shrink: 0;
      border-radius: 50%;
    }
  `,
})
export class ReportDistribution {
  readonly entries = input.required<DistributionValue[]>();
  readonly title = input.required<string>();
  readonly colors = [
    'var(--forest)',
    'var(--secondary)',
    'var(--tertiary)',
    'var(--outline)',
    'var(--primary-container)',
    'var(--secondary-line)',
  ];
  readonly invalid = computed(() =>
    this.entries().some(
      (item) =>
        item.value === null || !Number.isFinite(Number(item.value)) || Number(item.value) < 0,
    ),
  );
  readonly total = computed(() =>
    this.entries().reduce((sum, item) => sum + (Number(item.value) || 0), 0),
  );
  readonly gradient = computed(() => {
    if (this.invalid() || this.total() <= 0) return 'conic-gradient(var(--line) 0deg 360deg)';
    let start = 0;
    return `conic-gradient(${this.entries()
      .map((item, index) => {
        const end = start + (Number(item.value) / this.total()) * 360;
        const stop = `${this.colors[index % this.colors.length]} ${start}deg ${end}deg`;
        start = end;
        return stop;
      })
      .join(',')})`;
  });
  format(value: Metric) {
    return money(value);
  }
  share(value: Metric) {
    if (this.invalid() || this.total() <= 0) return 'Sin porcentaje';
    return (
      new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 }).format(
        (Number(value) / this.total()) * 100,
      ) + ' %'
    );
  }
}
