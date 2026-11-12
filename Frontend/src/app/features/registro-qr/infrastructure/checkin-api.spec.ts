import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { CheckinApi } from './checkin-api';
import { apiInterceptor } from '../../../core/http/api-interceptor';
import { SessionEvents } from '../../../core/http/session-events';
import { ApiFailure } from '../../../core/http/api-failure';
describe('contrato check-in público y privado', () => {
  let api: CheckinApi;
  let http: HttpTestingController;
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
    api = TestBed.inject(CheckinApi);
    http = TestBed.inject(HttpTestingController);
    document.cookie = 'csrftoken=unit-token; path=/';
  });
  afterEach(() => {
    http.verify();
    document.cookie = 'csrftoken=; Max-Age=0; path=/';
  });
  it('POST público envía solo datos explícitos y maneja respuesta genérica sin lookup de identidad', () => {
    api.submit('a-token', { telefono: '+51955123000' }).subscribe();
    const request = http.expectOne('/api/public/checkin/a-token/');
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(false);
    expect(request.request.body).toEqual({ telefono: '+51955123000' });
    request.flush({ detail: 'Solicitud recibida' }, { status: 202, statusText: 'Accepted' });
  });
  it.each([400, 401, 403, 404, 409, 429, 500])(
    'error público %s no altera la sesión administrativa ni revela detalles internos',
    (status) => {
      const expired = vi.fn();
      const events = TestBed.inject(SessionEvents);
      events.expired.subscribe(expired);
      let result: ApiFailure | undefined;
      api.config('a-token').subscribe({ error: (error: ApiFailure) => (result = error) });
      http
        .expectOne('/api/public/checkin/a-token/')
        .flush({ code: 'not_authenticated', detail: 'PRIVATE' }, { status, statusText: 'Error' });
      expect(result?.status).toBe(status);
      expect(result?.message).not.toContain('PRIVATE');
      expect(expired).not.toHaveBeenCalled();
      expect(events.notice()).toBeNull();
    },
  );
  it('confirmación privada obtiene CSRF y envía cookies, identidad y consentimiento explícitos', () => {
    api
      .resolve(12, 'confirmar', { identidad_verificada: true, consentimiento_verificado: true })
      .subscribe();
    http.expectOne('/api/auth/csrf/').flush({});
    const request = http.expectOne('/api/admin/checkin/llegadas/12/confirmar/');
    expect(request.request.headers.get('X-CSRFToken')).toBe('unit-token');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body.identidad_verificada).toBe(true);
    request.flush({ id: 12 });
  });
});
