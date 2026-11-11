import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { InventoryApi } from './inventory-api';
import { PurchasesApi } from '../../compras/infrastructure/purchases-api';
describe('HTTP inventario', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('envía cantidades/costos exactos y clave de creación después del CSRF', () => {
    const payload = {
      proveedor_id: null,
      numero_documento: 'TEST',
      observaciones: '',
      detalles: [
        {
          articulo_id: 1,
          unidad_id: 2,
          cantidad: '2.125',
          costo_unitario: '3.2500',
          numero_lote: null,
          vencimiento: null,
        },
      ],
    };
    TestBed.inject(PurchasesApi)
      .create(payload, '117fa9bc-e9d8-4496-9083-2b8ad51a1b6b')
      .subscribe();
    http.expectOne('/api/auth/csrf/').flush({});
    const request = http.expectOne('/api/compras/');
    expect(request.request.headers.get('Idempotency-Key')).toBe(
      '117fa9bc-e9d8-4496-9083-2b8ad51a1b6b',
    );
    expect(request.request.body.detalles[0].costo_unitario).toBe('3.2500');
    request.flush({ id: 1 });
  });
  it('recepción manda cuerpo vacío, no un cambio superficial de estado', () => {
    TestBed.inject(PurchasesApi).receive(9).subscribe();
    http.expectOne('/api/auth/csrf/').flush({});
    const request = http.expectOne('/api/compras/9/recibir/');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({ id: 9, estado: 'RECIBIDA' });
  });
  it('ajuste conserva su clave y saldo se toma del backend', () => {
    const payload = {
      articulo_id: 1,
      unidad_id: 2,
      tipo: 'AJUSTE_SALIDA' as const,
      cantidad: '0.125',
      justificacion: 'Conteo de prueba',
    };
    TestBed.inject(InventoryApi)
      .adjust(payload, '117fa9bc-e9d8-4496-9083-2b8ad51a1b6b')
      .subscribe();
    http.expectOne('/api/auth/csrf/').flush({});
    const request = http.expectOne('/api/inventario/ajustes/');
    expect(request.request.body).not.toHaveProperty('saldo_resultante');
    expect(request.request.headers.get('Idempotency-Key')).toBeTruthy();
    request.flush({ movimiento_id: 1, saldo_resultante: '1.000' });
  });
  it('no descarga todas las existencias para filtrar en navegador', () => {
    TestBed.inject(InventoryApi)
      .stock({ page: 2, page_size: 20, tipo: 'INSUMO', bajo_minimo: 'true' })
      .subscribe();
    const request = http.expectOne((r) => r.url === '/api/inventario/stock/');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('bajo_minimo')).toBe('true');
    request.flush({ count: 0, results: [], next: null, previous: null });
  });
});
