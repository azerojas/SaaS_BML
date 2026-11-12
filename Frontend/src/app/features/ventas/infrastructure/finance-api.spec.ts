import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { FinanceApi } from './finance-api';
import { apiInterceptor } from '../../../core/http/api-interceptor';
describe('adaptador de finanzas con contrato decimal, sesión y CSRF', () => {
  let api: FinanceApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([apiInterceptor]),
          withXsrfConfiguration({ cookieName: 'csrftoken', headerName: 'X-CSRFToken' }),
        ),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(FinanceApi);
    http = TestBed.inject(HttpTestingController);
    document.cookie = 'csrftoken=finance-test; path=/';
  });
  afterEach(() => {
    http.verify();
    document.cookie = 'csrftoken=; Max-Age=0; path=/';
  });
  it('un cobro envía decimal string, referencia, verificación y UUID, sin totales calculados', () => {
    api
      .mutate(
        '/api/ventas/5/pagar/',
        { metodo: 'YAPE', monto: '10.25', referencia: 'UNIT-REF', verificado_manualmente: true },
        '2a733174-a69b-449a-ab53-bc8add8bc3ee',
      )
      .subscribe();
    http.expectOne('/api/auth/csrf/').flush({});
    const request = http.expectOne('/api/ventas/5/pagar/');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.get('X-CSRFToken')).toBe('finance-test');
    expect(request.request.headers.get('Idempotency-Key')).toBe(
      '2a733174-a69b-449a-ab53-bc8add8bc3ee',
    );
    expect(typeof request.request.body.monto).toBe('string');
    expect(request.request.body.total).toBeUndefined();
    request.flush({ venta_id: 5 });
  });
  it('la propuesta de consumos no manda clave ni escribe stock desde Angular', () => {
    api
      .preview(5, [
        { detalle_id: 2, insumos: [{ articulo_id: 9, unidad_id: 1, cantidad: '0.125' }] },
      ])
      .subscribe();
    http.expectOne('/api/auth/csrf/').flush({});
    const request = http.expectOne('/api/ventas/5/previsualizar/');
    expect(request.request.headers.has('Idempotency-Key')).toBe(false);
    expect(request.request.body.consumos_reales[0].insumos[0].cantidad).toBe('0.125');
    request.flush({ afecta_stock: false });
  });
  it('un 409 financiero se propaga sin reintento automático del POST', () => {
    let failed = false;
    api.mutate('/api/ventas/5/confirmar/', {}, 'key').subscribe({ error: () => (failed = true) });
    http.expectOne('/api/auth/csrf/').flush({});
    http
      .expectOne('/api/ventas/5/confirmar/')
      .flush({ code: 'stock_insuficiente' }, { status: 409, statusText: 'Conflict' });
    expect(failed).toBe(true);
    http.expectNone('/api/ventas/5/confirmar/');
  });
  it('recuperar resultado solo consulta el endpoint real de la operación', () => {
    api.status('a-key', 'pago.registrar').subscribe();
    const request = http.expectOne('/api/finanzas/intentos/a-key/?operacion=pago.registrar');
    expect(request.request.method).toBe('GET');
    expect(request.request.body).toBeNull();
    request.flush({ encontrado: false, resultado: null });
  });
});
