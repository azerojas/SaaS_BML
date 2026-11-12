import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { LOCAL_ERROR_HANDLED } from '../../../core/http/api-interceptor';
import { Query } from '../../../shared/domain/records';
import { Report } from '../domain/analytics';
import {
  overviewAdapter,
  seriesAdapter,
  methodsAdapter,
  tableAdapter,
  comparisonAdapter,
} from './analytics-adapters';
@Injectable({ providedIn: 'root' })
export class AnalyticsApi {
  private readonly http = inject(HttpClient);
  private context() {
    return new HttpContext().set(LOCAL_ERROR_HANDLED, true);
  }
  private get(path: string, params: Query) {
    return this.http.get<unknown>('/api/v1/analytics/' + path + '/', {
      params,
      context: this.context(),
    });
  }
  overview(query: Query) {
    return this.get('overview', query).pipe(map(overviewAdapter));
  }
  series(query: Query) {
    return this.get('revenue-series', query).pipe(map(seriesAdapter));
  }
  methods(query: Query) {
    return this.get('payment-methods', query).pipe(map(methodsAdapter));
  }
  table(report: 'top-services' | 'top-clients' | 'inventory-alerts' | 'expenses', query: Query) {
    return this.get(report, query).pipe(map(tableAdapter));
  }
  comparison(month: string) {
    return this.get('month-comparison', { month }).pipe(map(comparisonAdapter));
  }
  export(report: Report, query: Query) {
    return this.http.get('/api/v1/reports/export.xlsx', {
      params: { ...query, report },
      context: this.context(),
      responseType: 'blob',
      observe: 'response',
    });
  }
}
