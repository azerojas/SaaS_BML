import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ReportResource } from './report-resource';
describe('lecturas cancelables y errores parciales', () => {
  it('cancela la consulta vieja y no muestra datos del período anterior', () => {
    const first = new Subject<string>();
    const second = new Subject<string>();
    const state = TestBed.runInInjectionContext(
      () => new ReportResource((q) => (q['range'] === 1 ? first : second)),
    );
    state.load({ range: 1 });
    expect(first.observed).toBe(true);
    state.load({ range: 2 });
    expect(first.observed).toBe(false);
    expect(state.data()).toBeNull();
    first.next('old');
    second.next('new');
    expect(state.data()).toBe('new');
    second.complete();
    expect(state.loading()).toBe(false);
  });
  it('un error no borra otro recurso y el reintento consulta el mismo filtro', () => {
    let fail = true;
    const calls: unknown[] = [];
    const state = TestBed.runInInjectionContext(
      () =>
        new ReportResource((q) => {
          calls.push(q);
          return fail ? throwError(() => new Error('Sin conexión')) : of('real');
        }),
    );
    const other = TestBed.runInInjectionContext(() => new ReportResource(() => of('visible')));
    other.load({});
    state.load({ desde: '2026-10-01' });
    expect(state.error()).toBe('Sin conexión');
    expect(other.data()).toBe('visible');
    fail = false;
    state.retry();
    expect(calls[1]).toEqual(calls[0]);
    expect(state.data()).toBe('real');
  });
});
