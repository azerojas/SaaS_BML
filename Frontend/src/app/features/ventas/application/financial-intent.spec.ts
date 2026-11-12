import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { FinancialIntent } from './financial-intent';
import { FinanceApi } from '../infrastructure/finance-api';
import { SessionStore } from '../../../core/auth/application/session-store';
import { ApiFailure } from '../../../core/http/api-failure';
import { FinanceResult, IntentResult } from '../domain/sale';
describe('cobros: recuperación e idempotencia sin persistir datos financieros', () => {
  const user = signal<{ id: number } | null>({ id: 7 });
  let api: { mutate: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> };
  const body = {
    metodo: 'YAPE',
    monto: '5.00',
    referencia: 'PRIVATE-REF-UNIT',
    verificado_manualmente: true,
  };
  beforeEach(() => {
    sessionStorage.clear();
    user.set({ id: 7 });
    api = {
      mutate: vi.fn(() => of({ venta_id: 3 })),
      status: vi.fn(() => of({ encontrado: false, resultado: null })),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: FinanceApi, useValue: api },
        { provide: SessionStore, useValue: { currentUser: user } },
      ],
    });
  });
  afterEach(() => sessionStorage.clear());
  const create = () => {
    const state = TestBed.inject(FinancialIntent);
    TestBed.tick();
    return state;
  };
  it('un doble envío en vuelo solo produce un POST con UUID', async () => {
    const source = new Subject<FinanceResult>();
    api.mutate.mockReturnValue(source);
    const state = create();
    const first = state.send('pago.registrar', '3', '/api/ventas/3/pagar/', body);
    expect(await state.send('pago.registrar', '3', '/api/ventas/3/pagar/', body)).toBeNull();
    expect(api.mutate).toHaveBeenCalledTimes(1);
    expect(api.mutate.mock.calls[0][2]).toMatch(/^[a-f0-9-]{36}$/);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('PRIVATE-REF-UNIT');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('5.00');
    source.next({ venta_id: 3 });
    await first;
    expect(sessionStorage.length).toBe(0);
  });
  it('respuesta perdida: consulta estado antes de reintentar y acepta resultado sin otro POST', async () => {
    api.mutate.mockReturnValue(throwError(() => new ApiFailure(0, 'network', 'Sin respuesta')));
    const state = create();
    await state.send('pago.registrar', '3', '/api/ventas/3/pagar/', body);
    expect(state.uncertain()).toBe(true);
    expect(
      await state.send('pago.registrar', '3', '/api/ventas/3/pagar/', { ...body, monto: '6.00' }),
    ).toBeNull();
    api.status.mockReturnValue(of({ encontrado: true, resultado: { venta_id: 3 } }));
    expect(await state.recover()).toEqual({ venta_id: 3 });
    expect(api.mutate).toHaveBeenCalledTimes(1);
    expect(sessionStorage.length).toBe(0);
  });
  it('sin resultado confirmado, el reintento conserva exactamente carga y clave', async () => {
    api.mutate.mockReturnValueOnce(
      throwError(() => new ApiFailure(503, 'unavailable', 'Sin resultado')),
    );
    const state = create();
    await state.send('pago.registrar', '3', '/api/ventas/3/pagar/', body);
    const key = api.mutate.mock.calls[0][2];
    await state.retry();
    expect(api.status).toHaveBeenCalledWith(key, 'pago.registrar');
    expect(api.mutate.mock.calls[1][2]).toBe(key);
    expect(api.mutate.mock.calls[1][1]).toEqual(body);
  });
  it('recarga: detecta la UUID pendiente y recupera sin almacenar el payload', async () => {
    sessionStorage.setItem(
      'lasheo.finance.7.pago.registrar.3',
      '2a733174-a69b-449a-ab53-bc8add8bc3ee',
    );
    const state = create();
    expect(state.uncertain()).toBe(true);
    expect(state.canRetry()).toBe(false);
    expect(await state.retry()).toBeNull();
    api.status.mockReturnValue(of({ encontrado: true, resultado: { venta_id: 3 } }));
    expect(await state.recover()).toEqual({ venta_id: 3 });
    expect(api.mutate).not.toHaveBeenCalled();
  });
  it('tras recarga sin resultado, bloquea otra operación y conserva clave para reingresar la misma', async () => {
    const key = '2a733174-a69b-449a-ab53-bc8add8bc3ee';
    sessionStorage.setItem('lasheo.finance.7.pago.registrar.3', key);
    const state = create();
    await state.recover();
    expect(await state.send('venta.crear', 'new', '/api/ventas/', {})).toBeNull();
    await state.send('pago.registrar', '3', '/api/ventas/3/pagar/', body);
    expect(api.mutate.mock.calls[0][2]).toBe(key);
  });
  it.each([400, 409, 422, 429])(
    'rechazo definitivo %s permite corregir sin conservar una intención falsa',
    async (status) => {
      api.mutate.mockReturnValue(
        throwError(() => new ApiFailure(status, 'validacion', 'Error', { monto: ['Inválido'] })),
      );
      const state = create();
      await state.send('pago.registrar', '3', '/api/ventas/3/pagar/', body);
      expect(state.uncertain()).toBe(false);
      expect(state.fields()['monto']).toEqual(['Inválido']);
      expect(sessionStorage.length).toBe(0);
    },
  );
  it.each([0, 401, 403, 500, 503])(
    'respuesta %s conserva UUID y exige comprobar el resultado',
    async (status) => {
      api.mutate.mockReturnValue(throwError(() => new ApiFailure(status, 'error', 'Error')));
      const state = create();
      await state.send('pago.registrar', '3', '/api/ventas/3/pagar/', body);
      expect(state.uncertain()).toBe(true);
      expect(sessionStorage.length).toBe(1);
    },
  );
  it('cambiar de usuario elimina el payload de memoria y no permite reintentar el cobro anterior', async () => {
    api.mutate.mockReturnValue(throwError(() => new ApiFailure(0, 'network', 'Error')));
    const state = create();
    await state.send('pago.registrar', '3', '/api/ventas/3/pagar/', body);
    user.set(null);
    TestBed.tick();
    expect(await state.retry()).toBeNull();
    expect(state.uncertain()).toBe(false);
    user.set({ id: 8 });
    TestBed.tick();
    expect(state.uncertain()).toBe(false);
  });
  it('una recuperación tardía del usuario anterior no entrega su resultado ni borra el intento del usuario nuevo', async () => {
    api.mutate.mockReturnValue(throwError(() => new ApiFailure(0, 'network', 'Error')));
    const state = create();
    await state.send('pago.registrar', '3', '/api/ventas/3/pagar/', body);
    const response = new Subject<IntentResult>();
    api.status.mockReturnValue(response);
    const recovery = state.recover();
    sessionStorage.setItem(
      'lasheo.finance.8.pago.registrar.8',
      '2a733174-a69b-449a-ab53-bc8add8bc3ee',
    );
    user.set({ id: 8 });
    TestBed.tick();
    response.next({
      encontrado: true,
      resultado: { venta_id: 3 },
      operacion: 'pago.registrar',
      estado_http: 201,
    });
    expect(await recovery).toBeNull();
    expect(state.uncertain()).toBe(true);
    expect(sessionStorage.getItem('lasheo.finance.8.pago.registrar.8')).not.toBeNull();
  });
});
