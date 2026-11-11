import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { PagedState } from './paged-state';
import { Page } from '../domain/records';
describe('búsqueda paginada con cancelación', () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });
  it('debounce cancela respuestas antiguas y conserva datos ante fallo de red', async () => {
    vi.useFakeTimers();
    const first = new Subject<Page<string>>();
    const second = new Subject<Page<string>>();
    let calls = 0;
    const state = TestBed.runInInjectionContext(
      () => new PagedState(() => (++calls === 1 ? first : second)),
    );
    await vi.advanceTimersByTimeAsync(300);
    state.filter({ search: 'nuevo' });
    await vi.advanceTimersByTimeAsync(300);
    first.next({ count: 1, next: null, previous: null, results: ['ANTIGUO'] });
    expect(state.rows()).toEqual([]);
    second.next({ count: 1, next: null, previous: null, results: ['VIGENTE'] });
    expect(state.rows()).toEqual(['VIGENTE']);
    second.error(new Error('Sin conexión'));
    expect(state.error()).toBe('Sin conexión');
    expect(state.rows()).toEqual(['VIGENTE']);
    expect(state.loading()).toBe(false);
  });
  it('reinicia página al filtrar y agrupa pulsaciones rápidas', async () => {
    vi.useFakeTimers();
    const loader = vi.fn(() => new Subject<Page<string>>());
    const state = TestBed.runInInjectionContext(() => new PagedState(loader));
    state.page(3);
    state.filter({ search: 'a' });
    state.filter({ search: 'ab' });
    await vi.advanceTimersByTimeAsync(300);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(state.query()['page']).toBe(1);
    expect(state.query()['search']).toBe('ab');
  });
});
