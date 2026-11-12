import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ReportsFacade } from '../application/reports-facade';
import { ReportDownload } from '../infrastructure/report-download';
import { SessionStore } from '../../../core/auth/application/session-store';
import { REPORT_LABELS } from '../domain/analytics';
import { ReportFilters } from './report-filters';
import { ReportPanel } from './report-panel';
import { ReportQuality } from './report-quality';
import { KpiGrid } from './kpi-grid';
import { FinancialTrend } from './financial-trend';
import { PaymentMethods } from './payment-methods';
import { ReportTable } from './report-table';
import { Alert } from '../../../shared/ui/alert';
import { Pager } from '../../../shared/ui/pager';
@Component({
  selector: 'bm-reports-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    ReportFilters,
    ReportPanel,
    ReportQuality,
    KpiGrid,
    FinancialTrend,
    PaymentMethods,
    ReportTable,
    Alert,
    Pager,
  ],
  providers: [ReportsFacade, ReportDownload],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reports-page.html',
})
export class ReportsPage {
  readonly facade = inject(ReportsFacade);
  readonly session = inject(SessionStore);
  readonly labels = REPORT_LABELS;
  readonly selection = inject(FormBuilder).nonNullable.group({
    report: this.facade.selected(),
    orden: 'importe',
  });
  constructor() {
    this.facade.reload();
  }
  select() {
    this.facade.select(this.selection.controls.report.value);
    this.selection.controls.orden.setValue('importe');
  }
  order() {
    this.facade.ordering.set(this.selection.controls.orden.value);
    this.facade.changePage(1);
  }
}
