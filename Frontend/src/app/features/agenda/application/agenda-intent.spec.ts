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
  it('recupera una intención tras recarga sin reenviar la mutación', async () => {
    const user = signal({ id: 7 });
    const key = '3c90c2b8-a3d4-4f30-a4ac-4cb045ce7d63';
    sessionStorage.setItem(
      'lasheo.agenda.7',
      JSON.stringify({
        key,
        path: '/api/v1/agenda/citas/',
        method: 'POST',
        digest: 'a'.repeat(64),
      }),
    );
    const mutate = vi.fn(),
      status = vi.fn(() => of({ encontrado: true, resultado: { cita_id: 41 } }));
    TestBed.overrideProvider(AgendaApi, { useValue: { mutate, status } });
    const state = TestBed.inject(AgendaIntent);
    TestBed.tick();
    expect(user().id).toBe(7);
    expect(await state.recover()).toEqual({ cita_id: 41 });
    expect(status).toHaveBeenCalledWith(key, '/api/v1/agenda/citas/', 'POST');
    expect(mutate).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });
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
  it('cierra un intento sin cambios antes de permitir guardar otro formulario', async () => {
    const resolve = vi.fn(() => of({ encontrado: false, cerrado: true, resultado: null }));
    TestBed.overrideProvider(AgendaApi, { useValue: { mutate, resolve } });
    mutate.mockReturnValueOnce(throwError(() => new ApiFailure(0, 'network', 'Sin respuesta')));
    const state = create();
    await state.send(path, body);
    const key = mutate.mock.calls[0][2];
    expect(await state.resolve()).toBeNull();
    expect(resolve).toHaveBeenCalledWith(key, path, 'POST');
    expect(state.pending()).toBe(false);
    expect(sessionStorage.length).toBe(0);
    expect(state.notice()).toContain('no realizó cambios');
    await state.send('/api/v1/agenda/horarios/', { dia_semana: 1 });
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(mutate.mock.calls[1][2]).not.toBe(key);
  });
  it('resolver recupera lo guardado sin reenviar la mutación', async () => {
    const resolve = vi.fn(() => of({ encontrado: true, resultado: { cita_id: 3 } }));
    TestBed.overrideProvider(AgendaApi, { useValue: { mutate, resolve } });
    mutate.mockReturnValueOnce(throwError(() => new ApiFailure(0, 'network', 'Sin respuesta')));
    const state = create();
    await state.send(path, body);
    expect(await state.resolve()).toEqual({ cita_id: 3 });
    expect(state.pending()).toBe(false);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(state.notice()).toContain('ya estaba guardada');
  });
  it('un fallo al resolver conserva la clave y bloquea otro formulario', async () => {
    const resolve = vi.fn(() => throwError(() => new ApiFailure(0, 'network', 'Sin respuesta')));
    TestBed.overrideProvider(AgendaApi, { useValue: { mutate, resolve } });
    mutate.mockReturnValueOnce(throwError(() => new ApiFailure(0, 'network', 'Sin respuesta')));
    const state = create();
    await state.send(path, body);
    const stored = sessionStorage.getItem('lasheo.agenda.7');
    await state.resolve();
    expect(state.pending()).toBe(true);
    expect(sessionStorage.getItem('lasheo.agenda.7')).toBe(stored);
    await state.send(path, { ...body, clienta_id: 9 });
    expect(mutate).toHaveBeenCalledTimes(1);
  });
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
