import { Icon } from '../../../shared/ui/icon';
import { DashboardMetrics } from './dashboard-metrics';
import { DashboardTrend } from './dashboard-trend';
import { DashboardMethods } from './dashboard-methods';
import { DashboardRanking } from './dashboard-ranking';
import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { DashboardFacade } from '../application/dashboard-facade';
import { ReportDownload } from '../infrastructure/report-download';
import { SessionStore } from '../../../core/auth/application/session-store';
import { ReportFilters } from './report-filters';
import { ReportPanel } from './report-panel';
import { ReportQuality } from './report-quality';
import { ReportTable } from './report-table';
import { MonthComparison } from './month-comparison';
import { Alert } from '../../../shared/ui/alert';
@Component({
  selector: 'bm-financial-summary',
  imports: [
    Icon,
    MatButtonModule,
    ReportFilters,
    ReportPanel,
    ReportQuality,
    DashboardMetrics,
    DashboardTrend,
    DashboardMethods,
    DashboardRanking,
    ReportTable,
    MonthComparison,
    Alert,
  ],
  providers: [DashboardFacade, ReportDownload],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './financial-summary.html',
  styleUrl: './financial-summary.scss',
  encapsulation: ViewEncapsulation.None,
})
export class FinancialSummary {
  readonly chartMode = signal<'bars' | 'lines'>('bars');
  readonly activeSeries = signal<
    'all' | 'ventas_confirmadas' | 'cobros_registrados' | 'anticipos_recibidos'
  >('all');
  readonly paymentMode = signal<'cobros_registrados' | 'anticipos_recibidos'>('cobros_registrados');
  readonly facade = inject(DashboardFacade);
  readonly session = inject(SessionStore);
  constructor() {
    this.facade.apply(this.facade.filters());
  }
}
