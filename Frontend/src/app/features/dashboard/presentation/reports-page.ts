import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ReportsFacade } from '../application/reports-facade';
import { ReportDownload } from '../infrastructure/report-download';
import { SessionStore } from '../../../core/auth/application/session-store';
import { REPORT_LABELS, Report } from '../domain/analytics';
import { presetFilters } from '../domain/periods';
import { ReportPanel } from './report-panel';
import { ReportChart } from './report-chart';
import { Alert } from '../../../shared/ui/alert';
import { Icon } from '../../../shared/ui/icon';
@Component({
  selector: 'bm-reports-page',
  imports: [MatButtonModule, ReportPanel, ReportChart, Alert, Icon],
  providers: [ReportsFacade, ReportDownload],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reports-page.html',
  styles: `
    :host {
      display: block;
      width: 100%;
      min-width: 0;
    }
    .general-report {
      margin-bottom: 24px;
    }
    .report-selection {
      margin-bottom: 24px;
    }
    .report-selection label {
      display: block;
      margin-bottom: 8px;
    }
    .report-selection select {
      width: 100%;
      max-width: 480px;
    }
    .report-export {
      display: flex;
      justify-content: flex-end;
      margin-top: 24px;
    }
    .export-content {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      vertical-align: middle;
    }
    .report-period {
      color: var(--muted);
      font-size: 0.82rem;
      line-height: 1.7;
    }
  `,
})
export class ReportsPage {
  readonly facade = inject(ReportsFacade);
  readonly session = inject(SessionStore);
  readonly labels = REPORT_LABELS;
  constructor() {
    this.facade.apply(presetFilters('month'));
  }
  select(event: Event) {
    this.facade.select((event.target as HTMLSelectElement).value as Report);
  }
}
