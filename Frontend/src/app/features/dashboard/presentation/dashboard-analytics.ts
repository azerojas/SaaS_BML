import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { DashboardFacade } from '../application/dashboard-facade';
import { ReportDownload } from '../infrastructure/report-download';
import { SessionStore } from '../../../core/auth/application/session-store';
import { ReportFilters } from './report-filters';
import { ReportPanel } from './report-panel';
import { ReportQuality } from './report-quality';
import { KpiGrid } from './kpi-grid';
import { FinancialTrend } from './financial-trend';
import { PaymentMethods } from './payment-methods';
import { ReportTable } from './report-table';
import { MonthComparison } from './month-comparison';
import { Alert } from '../../../shared/ui/alert';
@Component({
  selector: 'bm-dashboard-analytics',
  imports: [
    RouterLink,
    MatButtonModule,
    ReportFilters,
    ReportPanel,
    ReportQuality,
    KpiGrid,
    FinancialTrend,
    PaymentMethods,
    ReportTable,
    MonthComparison,
    Alert,
  ],
  providers: [DashboardFacade, ReportDownload],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-analytics.html',
})
export class DashboardAnalytics {
  readonly facade = inject(DashboardFacade);
  readonly session = inject(SessionStore);
  constructor() {
    this.facade.apply(this.facade.filters());
  }
}
