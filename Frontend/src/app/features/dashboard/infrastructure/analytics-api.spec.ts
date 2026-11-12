import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpHeaders, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsApi } from './analytics-api';
import { apiInterceptor } from '../../../core/http/api-interceptor';
import { SessionEvents } from '../../../core/http/session-events';
import { ApiFailure } from '../../../core/http/api-failure';
import { overviewFixture } from '../tests/fixtures';
describe('analítica HTTP real, cookies y errores de descarga binaria', () => {
  let api: AnalyticsApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(AnalyticsApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('envía filtros exactos y cookies al overview privado', () => {
    api
      .overview({
        desde: '2026-10-01',
        hasta: '2026-11-01',
        granularidad: 'day',
        timezone: 'America/Lima',
      })
      .subscribe();
    const request = http.expectOne((req) => req.url === '/api/v1/analytics/overview/');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.params.get('hasta')).toBe('2026-11-01');
    request.flush(overviewFixture());
  });
  it('exporta con responseType blob sin inventar un POST financiero', () => {
    api.export('overview', { desde: '2026-10-01', hasta: '2026-11-01' }).subscribe();
    const request = http.expectOne((req) => req.url === '/api/v1/reports/export.xlsx');
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('blob');
    expect(request.request.params.get('report')).toBe('overview');
    expect(request.request.headers.has('Idempotency-Key')).toBe(false);
    request.flush(new Blob(['test']));
  });
  it.each([400, 403, 422, 429, 500])(
    'propaga error %s sin ocultar las otras tarjetas mediante un aviso global',
    (status) => {
      let error: ApiFailure | undefined;
      api.overview({}).subscribe({ error: (value: ApiFailure) => (error = value) });
      http
        .expectOne('/api/v1/analytics/overview/')
        .flush({ code: 'invalid', detail: 'PRIVATE-SQL' }, { status, statusText: 'Error' });
      expect(error?.status).toBe(status);
      expect(error?.message).not.toContain('PRIVATE-SQL');
      expect(TestBed.inject(SessionEvents).notice()).toBeNull();
    },
  );
  it('decodifica JSON de un error blob y conserva la expiración global de sesión', async () => {
    const expired = vi.fn();
    TestBed.inject(SessionEvents).expired.subscribe(expired);
    let error: ApiFailure | undefined;
    api.export('overview', {}).subscribe({ error: (value: ApiFailure) => (error = value) });
    const blob = new Blob(['{"code":"not_authenticated"}'], { type: 'application/json' });
    Object.defineProperty(blob, 'text', { value: async () => '{"code":"not_authenticated"}' });
    http
      .expectOne((req) => req.url === '/api/v1/reports/export.xlsx')
      .flush(blob, {
        status: 403,
        statusText: 'Forbidden',
        headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
      });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(error?.code).toBe('not_authenticated');
    expect(expired).toHaveBeenCalledOnce();
  });
  it('una respuesta tardía de lectura se convierte en timeout sin reintento automático', async () => {
    vi.useFakeTimers();
    let error: ApiFailure | undefined;
    TestBed.inject(HttpClient)
      .get('/api/v1/analytics/overview/')
      .subscribe({ error: (value: ApiFailure) => (error = value) });
    const request = http.expectOne('/api/v1/analytics/overview/');
    vi.advanceTimersByTime(10001);
    expect(error?.code).toBe('timeout');
    expect(request.cancelled).toBe(true);
    vi.useRealTimers();
  });
});
