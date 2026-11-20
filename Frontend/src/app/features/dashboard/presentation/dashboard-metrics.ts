import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Overview, money } from '../domain/analytics';
import { Icon } from '../../../shared/ui/icon';
@Component({
  selector: 'bm-dashboard-metrics',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="metric-grid">
    @for (metric of metrics; track metric.key; let index = $index) {
      <article class="metric" [attr.data-tone]="index">
        <div class="metric-heading">
          <span>{{ metric.label }}</span
          ><bm-icon [name]="metric.icon" />
        </div>
        <strong [attr.data-testid]="'dashboard-kpi-' + metric.key">{{ amount(metric.key) }}</strong>
        <p>{{ metric.hint }}</p>
        <div class="metric-foot">
          <span>{{ metric.footLabel }}</span
          ><b>{{
            metric.count
              ? count(data().indicadores[metric.footKey])
              : money(data().indicadores[metric.footKey])
          }}</b>
        </div>
      </article>
    }
  </div>`,
  styleUrl: './dashboard-metrics.scss',
})
export class DashboardMetrics {
  readonly data = input.required<Overview>();
  readonly money = money;
  readonly metrics = [
    {
      key: 'ventas_confirmadas',
      label: 'Ventas confirmadas',
      icon: 'chart',
      hint: 'Facturación del período, incluida la propina.',
      footLabel: 'Ventas del período',
      footKey: 'numero_ventas',
      count: true,
    },
    {
      key: 'utilidad_estimada',
      label: 'Utilidad operativa estimada',
      icon: 'receipt',
      hint: 'Según costos y registros verificados.',
      footLabel: 'Gastos operativos',
      footKey: 'gastos_operativos',
      count: false,
    },
    {
      key: 'cobros_registrados',
      label: 'Cobros registrados',
      icon: 'receipt',
      hint: 'Pagos recibidos en el período, sin anticipos.',
      footLabel: 'Anticipos recibidos',
      footKey: 'anticipos_recibidos',
      count: false,
    },
    {
      key: 'saldo_pendiente',
      label: 'Saldo por cobrar',
      icon: 'clock',
      hint: 'Saldo de las ventas seleccionadas, verificado por el servidor.',
      footLabel: 'Ticket promedio',
      footKey: 'ticket_promedio',
      count: false,
    },
  ];
  amount(key: string) {
    return money(
      key === 'utilidad_estimada' && !this.data().utilidad_estimada_habilitada
        ? null
        : this.data().indicadores[key],
    );
  }
  count(value: unknown) {
    return typeof value === 'number'
      ? new Intl.NumberFormat('es-PE').format(value)
      : 'No disponible';
  }
}
