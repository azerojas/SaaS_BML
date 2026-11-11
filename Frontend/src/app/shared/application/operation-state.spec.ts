import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { describe, it, expect } from 'vitest';
import { OperationState, RecordState } from './operation-state';
describe('mutaciones y detalle', () => {
  it('bloquea doble envío y no anuncia un guardado antes de la respuesta', async () => {
    const state = new OperationState();
    const source = new Subject<string>();
    const first = state.run(source);
    expect(state.busy()).toBe(true);
    expect(await state.run(of('duplicado'))).toBeNull();
    source.next('confirmado');
    expect(await first).toBe('confirmado');
    expect(state.busy()).toBe(false);
  });
  it('una respuesta de detalle vieja no revela otra ficha después de navegar', async () => {
    const state = TestBed.runInInjectionContext(() => new RecordState<string>());
    const old = new Subject<string>();
    const first = state.load(old);
    await state.load(of('ficha actual'));
    old.next('ficha anterior');
    await first;
    expect(state.record()).toBe('ficha actual');
  });
});
