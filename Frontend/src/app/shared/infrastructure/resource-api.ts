import { HttpClient, HttpContext } from '@angular/common/http';
import { LOCAL_ERROR_HANDLED } from '../../core/http/api-interceptor';
import { inject, Injectable } from '@angular/core';
import { switchMap } from 'rxjs';
import { Page, PresentationConfig, Query } from '../domain/records';
@Injectable({ providedIn: 'root' })
export class ResourceApi {
  private readonly http = inject(HttpClient);
  list<T>(path: string, params: Query = {}) {
    return this.http.get<Page<T>>(path, { params });
  }
  get<T>(path: string) {
    return this.http.get<T>(path);
  }
  config() {
    return this.get<PresentationConfig>('/api/auth/config/');
  }
  write<T>(
    method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    body: unknown = {},
    headers: Readonly<Record<string, string>> = {},
  ) {
    const context = new HttpContext().set(LOCAL_ERROR_HANDLED, true);
    return this.http
      .get<unknown>('/api/auth/csrf/', { context })
      .pipe(switchMap(() => this.http.request<T>(method, path, { body, headers, context })));
  }
}
