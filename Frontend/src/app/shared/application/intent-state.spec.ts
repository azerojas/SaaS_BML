import { afterEach, describe, it, expect } from 'vitest';
import { of, throwError, Subject } from 'rxjs';
import { IntentState } from './intent-state';
import { ApiFailure } from '../../core/http/api-failure';
describe('intentos de inventario sin persistir datos de compra', () => {
  afterEach(() => sessionStorage.clear());
  it('reintenta con la misma UUID tras perder respuesta y almacena solo esa UUID', async () => {
    const state = new IntentState<{ cantidad: string }, { id: number }>('purchase', 7);
    const body = { cantidad: '2.125' };
    await state.send(body, () => throwError(() => new ApiFailure(0, 'network', 'Sin conexión')));
    const key = state.key();
    expect(state.uncertain()).toBe(true);
    expect(sessionStorage.getItem('lasheo.pending.purchase.7')).toBe(key);
    expect(sessionStorage.getItem('lasheo.pending.purchase.7')).not.toContain('cantidad');
    await state.send(body, (_, sentKey) => {
      expect(sentKey).toBe(key);
      return of({ id: 2 });
    });
    expect(state.result()).toEqual({ id: 2 });
    expect(sessionStorage.getItem('lasheo.pending.purchase.7')).toBeNull();
  });
  it('bloquea cambiar contenido de un resultado incierto y permite recuperar tras recarga', async () => {
    const first = new IntentState<{ cantidad: string }, { id: number }>('adjustment', 5);
    await first.send({ cantidad: '1.000' }, () =>
      throwError(() => new ApiFailure(503, 'unavailable', 'No confirmado')),
    );
    const key = first.key();
    const reloaded = new IntentState<{ cantidad: string }, { id: number }>('adjustment', 5);
    expect(reloaded.needsRecovery()).toBe(true);
    expect(reloaded.key()).toBe(key);
    expect(reloaded.body()).toBeNull();
    expect(await reloaded.send({ cantidad: '2.000' }, () => of({ id: 3 }))).toBeNull();
    expect(await first.send({ cantidad: '2.000' }, () => of({ id: 3 }))).toBeNull();
    reloaded.accept({ id: 1 });
    expect(sessionStorage.length).toBe(0);
  });
  it('un doble envío o una respuesta ya confirmada no crea una segunda operación', async () => {
    const state = new IntentState<{ cantidad: string }, { id: number }>('purchase', 3);
    const source = new Subject<{ id: number }>();
    const first = state.send({ cantidad: '1.000' }, () => source);
    expect(await state.send({ cantidad: '1.000' }, () => of({ id: 999 }))).toBeNull();
    source.next({ id: 1 });
    await first;
    expect(await state.send({ cantidad: '1.000' }, () => of({ id: 999 }))).toEqual({ id: 1 });
  });
});
