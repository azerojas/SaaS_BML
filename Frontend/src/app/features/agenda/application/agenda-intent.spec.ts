import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgendaIntent } from './agenda-intent';
import { AgendaApi } from '../infrastructure/agenda-api';
import { SessionStore } from '../../../core/auth/application/session-store';
import { ApiFailure } from '../../../core/http/api-failure';
import { MutationResult } from '../domain/agenda';
describe('Agenda: idempotencia sin persistir datos personales', () => {
  const user = signal<{ id: number } | null>({ id: 7 });
  let mutate: ReturnType<typeof vi.fn>;
  const path = '/api/v1/agenda/citas/';
  const body = {
    clienta_id: 4,
    notas: 'PRIVATE_SENTINEL_AGENDA',
    inicio_en: '2026-12-01T09:00:00-05:00',
  };
  beforeEach(() => {
    sessionStorage.clear();
    user.set({ id: 7 });
    mutate = vi.fn(() => of({ cita_id: 3 }));
    TestBed.configureTestingModule({
      providers: [
        { provide: AgendaApi, useValue: { mutate } },
        { provide: SessionStore, useValue: { currentUser: user } },
      ],
    });
  });
  afterEach(() => sessionStorage.clear());
  const create = () => {
    const intent = TestBed.inject(AgendaIntent);
    TestBed.tick();
    return intent;
  };
  it('doble clic solo envía una solicitud con UUID', async () => {
    const source = new Subject<MutationResult>();
    mutate.mockReturnValue(source);
    const state = create();
    const first = state.send(path, body);
    expect(await state.send(path, body)).toBeNull();
    await vi.waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(mutate.mock.calls[0][2]).toMatch(/^[a-f\d-]{36}$/);
    source.next({ cita_id: 3 });
    expect(await first).toEqual({ cita_id: 3 });
    expect(sessionStorage.length).toBe(0);
  });
  it('respuesta perdida conserva clave, cuerpo e impide operación diferente', async () => {
    mutate.mockReturnValueOnce(throwError(() => new ApiFailure(0, 'network', 'Sin respuesta')));
    const state = create();
    await state.send(path, body);
    expect(state.pending()).toBe(true);
    const key = mutate.mock.calls[0][2];
    expect(sessionStorage.getItem('lasheo.agenda.7')).not.toContain(body.notas);
    expect(sessionStorage.getItem('lasheo.agenda.7')).not.toContain(body.inicio_en);
    await state.send(path, { ...body, clienta_id: 9 });
    expect(mutate).toHaveBeenCalledTimes(1);
    await state.retry();
    expect(mutate.mock.calls[1][2]).toBe(key);
    expect(mutate.mock.calls[1][1]).toEqual(body);
  });
  it('HTTP409 de disponibilidad libera intención para volver a consultar', async () => {
    mutate.mockReturnValue(throwError(() => new ApiFailure(409, 'SLOT_NOT_AVAILABLE', 'Ocupado')));
    const state = create();
    await state.send(path, body);
    expect(state.pending()).toBe(false);
    expect(state.failure()?.status).toBe(409);
    expect(sessionStorage.length).toBe(0);
  });
  it('403 de política dentro de la transacción permite corregir la excepción autorizada', async () => {
    mutate.mockReturnValueOnce(
      throwError(() => new ApiFailure(403, 'CANCELLATION_DEADLINE', 'Fuera de plazo')),
    );
    const state = create();
    await state.send(path, { fuera_plazo_autorizado: false });
    expect(state.pending()).toBe(false);
    await state.send(path, { fuera_plazo_autorizado: true });
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(mutate.mock.calls[1][2]).not.toBe(mutate.mock.calls[0][2]);
  });
  it('403 de permiso genérico conserva una posible operación previa', async () => {
    mutate.mockReturnValue(
      throwError(() => new ApiFailure(403, 'permission_denied', 'Sin permiso')),
    );
    const state = create();
    await state.send(path, body);
    expect(state.pending()).toBe(true);
    expect(sessionStorage.length).toBe(1);
  });
  it('conflicto de idempotencia nunca libera clave', async () => {
    mutate.mockReturnValue(
      throwError(() => new ApiFailure(409, 'idempotencia_conflicto', 'Otra solicitud')),
    );
    const state = create();
    await state.send(path, body);
    expect(state.pending()).toBe(true);
    expect(sessionStorage.length).toBe(1);
  });
  it('recarga permite únicamente el mismo formulario y clave', async () => {
    mutate.mockReturnValueOnce(
      throwError(() => new ApiFailure(503, 'unavailable', 'Sin respuesta')),
    );
    const original = create();
    await original.send(path, body);
    const key = mutate.mock.calls[0][2];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AgendaApi, useValue: { mutate } },
        { provide: SessionStore, useValue: { currentUser: user } },
      ],
    });
    const restored = create();
    expect(restored.pending()).toBe(true);
    await restored.send('/api/anticipos/', {});
    expect(mutate).toHaveBeenCalledTimes(1);
    await restored.send(path, body);
    expect(mutate.mock.calls[1][2]).toBe(key);
  });
  it('cambio de usuario descarta respuesta tardía', async () => {
    const source = new Subject<MutationResult>();
    mutate.mockReturnValue(source);
    const state = create();
    const first = state.send(path, body);
    await vi.waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    user.set({ id: 8 });
    TestBed.tick();
    source.next({ cita_id: 3 });
    expect(await first).toBeNull();
    expect(state.pending()).toBe(false);
  });
});
