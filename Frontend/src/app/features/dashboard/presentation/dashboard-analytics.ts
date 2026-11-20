import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { HomeSummary } from '../application/home-summary';
import { DashboardMetrics } from './dashboard-metrics';
import { ReportFilters } from './report-filters';
import { ReportPanel } from './report-panel';
import { DashboardTrend } from './dashboard-trend';
import { DashboardMethods } from './dashboard-methods';

@Component({
  selector: 'bm-dashboard-analytics',
  imports: [
    RouterLink,
    MatButtonModule,
    DashboardMetrics,
    ReportFilters,
    ReportPanel,
    DashboardTrend,
    DashboardMethods,
  ],
  providers: [HomeSummary],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-analytics.html',
  styleUrl: './dashboard-analytics.scss',
})
export class DashboardAnalytics {
  readonly chartMode = signal<'bars' | 'lines'>('bars');
  readonly activeSeries = signal<
    'all' | 'ventas_confirmadas' | 'cobros_registrados' | 'anticipos_recibidos'
  >('all');
  readonly paymentMode = signal<'cobros_registrados' | 'anticipos_recibidos'>('cobros_registrados');
  readonly facade = inject(HomeSummary);
  constructor() {
    this.facade.apply(this.facade.filters());
  }
}
