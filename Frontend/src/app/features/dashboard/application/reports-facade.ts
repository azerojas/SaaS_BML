import { inject, Injectable, signal } from '@angular/core';
import { SessionStore } from '../../../core/auth/application/session-store';
import { Query } from '../../../shared/domain/records';
import { AnalyticsApi } from '../infrastructure/analytics-api';
import { ReportDownload } from '../infrastructure/report-download';
import { AnalyticsFilters, Report, REPORTS, reportPermission } from '../domain/analytics';
import { analyticsQuery, presetFilters } from '../domain/periods';
import { ReportResource } from './report-resource';
@Injectable()
export class ReportsFacade {
  private readonly api = inject(AnalyticsApi);
  private readonly session = inject(SessionStore);
  readonly download = inject(ReportDownload);
  readonly filters = signal(presetFilters('day'));
  readonly available = REPORTS.filter((report) =>
    this.session.hasPermission(reportPermission(report)),
  );
  readonly selected = signal<Report>(this.available[0] ?? 'overview');
  readonly page = signal(1);
  readonly ordering = signal('importe');
  readonly limit = signal(100);
  readonly overview = new ReportResource((q) => this.api.overview(q));
  readonly series = new ReportResource((q) => this.api.series(q));
  readonly methods = new ReportResource((q) => this.api.methods(q));
  readonly table = new ReportResource((q) =>
    this.api.table(
      this.selected() as 'top-services' | 'top-clients' | 'inventory-alerts' | 'expenses',
      q,
    ),
  );
  query(paginated = true): Query {
    const report = this.selected();
    const query = analyticsQuery(this.filters());
    return {
      ...query,
      ...(['top-services', 'top-clients'].includes(report)
        ? { orden: this.ordering(), limit: this.limit() }
        : {}),
      ...(paginated && !['overview', 'revenue-series', 'payment-methods'].includes(report)
        ? { page: this.page(), page_size: 20 }
        : {}),
    };
  }
  apply(filters: AnalyticsFilters) {
    analyticsQuery(filters);
    this.filters.set(filters);
    this.page.set(1);
    this.reload();
    if (this.selected() !== 'overview' && this.available.includes('overview')) {
      this.overview.load(analyticsQuery(this.filters()));
    }
  }
  select(report: Report) {
    if (!this.available.includes(report)) return;
    this.selected.set(report);
    this.page.set(1);
    this.ordering.set('importe');
    this.reload();
  }
  resource() {
    const report = this.selected();
    return report === 'overview'
      ? this.overview
      : report === 'revenue-series'
        ? this.series
        : report === 'payment-methods'
          ? this.methods
          : this.table;
  }
  reload() {
    if (this.available.includes(this.selected())) this.resource().load(this.query());
  }
  changePage(page: number) {
    this.page.set(page);
    this.reload();
  }
  export() {
    if (this.available.includes(this.selected()) && this.session.hasPermission('reporting.export'))
      return this.download.save(this.selected(), this.query(false));
    return Promise.resolve();
  }
}
