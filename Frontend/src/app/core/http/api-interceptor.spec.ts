import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  HttpContext,
  provideHttpClient,
  withInterceptors,
  withXsrfConfiguration,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiInterceptor, AUTH_REQUEST, LOCAL_ERROR_HANDLED } from './api-interceptor';
import { SessionEvents } from './session-events';
import { ApiFailure } from './api-failure';

describe('HTTP: CSRF, permisos y errores', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let events: SessionEvents;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withXsrfConfiguration({ cookieName: 'csrftoken', headerName: 'X-CSRFToken' }),
          withInterceptors([apiInterceptor]),
        ),
        provideHttpClientTesting(),
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    events = TestBed.inject(SessionEvents);
    document.cookie = 'csrftoken=unit-csrf-token; path=/';
  });
  afterEach(() => {
    http.verify();
    document.cookie = 'csrftoken=; Max-Age=0; path=/';
  });
  it('POST relativo lleva X-CSRFToken y credenciales, GET no lleva token', () => {
    client.post('/api/auth/login/', {}).subscribe();
    const post = http.expectOne('/api/auth/login/');
    expect(post.request.headers.get('X-CSRFToken')).toBe('unit-csrf-token');
    expect(post.request.withCredentials).toBe(true);
    post.flush({});
    client.get('/api/auth/me/').subscribe();
    const get = http.expectOne('/api/auth/me/');
    expect(get.request.headers.has('X-CSRFToken')).toBe(false);
    get.flush({});
  });
  it('no envía cookies ni CSRF a un origen ajeno', () => {
    client.post('https://example.test/api/', {}).subscribe();
    const request = http.expectOne('https://example.test/api/');
    expect(request.request.withCredentials).toBe(false);
    expect(request.request.headers.has('X-CSRFToken')).toBe(false);
    request.flush({});
  });
  it('403 por permiso no destruye sesión; not_authenticated sí publica expiración', () => {
    const expired = vi.fn();
    events.expired.subscribe(expired);
    client.get('/api/clientas/').subscribe({ error: () => undefined });
    http
      .expectOne('/api/clientas/')
      .flush({ code: 'permission_denied' }, { status: 403, statusText: 'Forbidden' });
    expect(expired).not.toHaveBeenCalled();
    expect(events.notice()).toContain('permiso');
    client.get('/api/clientas/').subscribe({ error: () => undefined });
    http
      .expectOne('/api/clientas/')
      .flush({ code: 'not_authenticated' }, { status: 403, statusText: 'Forbidden' });
    expect(expired).toHaveBeenCalledOnce();
  });
  it('401 de login se trata en formulario y no dispara redirección global', () => {
    const expired = vi.fn();
    events.expired.subscribe(expired);
    client
      .post('/api/auth/login/', {}, { context: new HttpContext().set(AUTH_REQUEST, true) })
      .subscribe({ error: () => undefined });
    http
      .expectOne('/api/auth/login/')
      .flush({ code: 'credenciales_invalidas' }, { status: 401, statusText: 'Unauthorized' });
    expect(expired).not.toHaveBeenCalled();
    expect(events.notice()).toBeNull();
  });
  it('no expone detalles internos del servidor', () => {
    let result: unknown;
    client.get('/api/example/').subscribe({
      error: (error: unknown) => {
        result = error;
      },
    });
    http
      .expectOne('/api/example/')
      .flush({ detail: 'SQL PRIVATE TRACE SECRET' }, { status: 500, statusText: 'Error' });
    expect(result).toBeInstanceOf(ApiFailure);
    expect((result as ApiFailure).message).not.toContain('SECRET');
  });
  it('entrega un conflicto al formulario sin dejar un aviso global obsoleto', () => {
    let failure: unknown;
    client
      .post(
        '/api/inventario/ajustes/',
        {},
        {
          context: new HttpContext().set(LOCAL_ERROR_HANDLED, true),
        },
      )
      .subscribe({ error: (error: unknown) => (failure = error) });
    http
      .expectOne('/api/inventario/ajustes/')
      .flush({ code: 'stock_insuficiente' }, { status: 409, statusText: 'Conflict' });
    expect(failure).toBeInstanceOf(ApiFailure);
    expect((failure as ApiFailure).code).toBe('stock_insuficiente');
    expect(events.notice()).toBeNull();
  });
  it('el manejo local de errores conserva la caducidad global de sesión', () => {
    const expired = vi.fn();
    events.expired.subscribe(expired);
    client
      .post('/api/compras/', {}, { context: new HttpContext().set(LOCAL_ERROR_HANDLED, true) })
      .subscribe({ error: () => undefined });
    http
      .expectOne('/api/compras/')
      .flush({ code: 'mfa_required' }, { status: 403, statusText: 'Forbidden' });
    expect(expired).toHaveBeenCalledOnce();
  });
});
