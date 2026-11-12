import { inject, Injectable, signal } from '@angular/core';
import { SessionStore } from '../../../core/auth/application/session-store';
import { AnalyticsApi } from '../infrastructure/analytics-api';
import { ReportDownload } from '../infrastructure/report-download';
import { AnalyticsFilters } from '../domain/analytics';
import { analyticsQuery, presetFilters } from '../domain/periods';
import { ReportResource } from './report-resource';
@Injectable()
export class DashboardFacade {
  private readonly api = inject(AnalyticsApi);
  private readonly session = inject(SessionStore);
  readonly download = inject(ReportDownload);
  readonly filters = signal(presetFilters('day'));
  readonly overview = new ReportResource((q) => this.api.overview(q));
  readonly series = new ReportResource((q) => this.api.series(q));
  readonly methods = new ReportResource((q) => this.api.methods(q));
  readonly services = new ReportResource((q) => this.api.table('top-services', q));
  readonly clients = new ReportResource((q) => this.api.table('top-clients', q));
  readonly inventory = new ReportResource((q) => this.api.table('inventory-alerts', q));
  readonly expenses = new ReportResource((q) => this.api.table('expenses', q));
  readonly comparison = new ReportResource((q) => this.api.comparison(String(q['month'])));
  readonly monthly = signal(false);
  apply(filters: AnalyticsFilters) {
    const query = analyticsQuery(filters);
    this.filters.set(filters);
    this.overview.load(query);
    this.series.load(query);
    this.methods.load(query);
    this.services.load({ ...query, page: 1, page_size: 5, limit: 5, orden: 'importe' });
    this.expenses.load({ ...query, page: 1, page_size: 5 });
    if (this.session.hasPermission('reporting.view_clients'))
      this.clients.load({ ...query, page: 1, page_size: 5, limit: 5, orden: 'importe' });
    if (this.session.hasPermission('reporting.view_inventory'))
      this.inventory.load({ ...query, page: 1, page_size: 5 });
    this.monthly.set(filters.preset === 'month' || filters.preset === 'previousmonth');
    if (this.monthly()) this.comparison.load({ month: filters.desde.slice(0, 7) });
  }
  export() {
    return this.download.save('overview', analyticsQuery(this.filters()));
  }
}
