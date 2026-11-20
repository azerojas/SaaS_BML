import { afterEach, describe, expect, it } from 'vitest';
import { VisitFilters } from './visit-filters';

describe('Filtros de visitas por usuario', () => {
  afterEach(() => sessionStorage.clear());
  it('restaura fechas y estado al volver, sin compartirlos entre usuarios', () => {
    const filters = new VisitFilters();
    const saved = { desde: '2026-10-01', hasta: '2026-10-15', estado: 'ABIERTA' };
    filters.save(1, saved);
    expect(new VisitFilters().read(1, '2026-11-20')).toEqual(saved);
    expect(filters.read(2, '2026-11-20').desde).toBe('2026-11-20');
  });
  it('descarta fechas corruptas, rangos invertidos y estados desconocidos', () => {
    const filters = new VisitFilters();
    for (const value of [
      { desde: '2026-02-30', hasta: '', estado: '' },
      { desde: '2026-10-15', hasta: '2026-10-01', estado: '' },
      { desde: '', hasta: '', estado: 'inventado' },
    ]) {
      sessionStorage.setItem('lasheo.visits.filters.1', JSON.stringify(value));
      expect(filters.read(1, '2026-11-20')).toEqual({
        desde: '2026-11-20',
        hasta: '2026-11-20',
        estado: '',
      });
    }
  });
});
