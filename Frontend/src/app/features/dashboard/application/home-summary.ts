import { inject, Injectable, signal } from '@angular/core';
import { AnalyticsApi } from '../infrastructure/analytics-api';
import { AnalyticsFilters } from '../domain/analytics';
import { analyticsQuery, presetFilters } from '../domain/periods';
import { ReportResource } from './report-resource';

@Injectable()
export class HomeSummary {
  private readonly api = inject(AnalyticsApi);
  readonly filters = signal(presetFilters('last7'));
  readonly overview = new ReportResource((query) => this.api.overview(query));
  readonly series = new ReportResource((query) => this.api.series(query));
  readonly methods = new ReportResource((query) => this.api.methods(query));

  apply(filters: AnalyticsFilters) {
    const query = analyticsQuery(filters);
    this.filters.set(filters);
    this.overview.load(query);
    this.series.load(query);
    this.methods.load(query);
  }
}
