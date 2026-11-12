import { describe, it, expect } from 'vitest';
import { calendarDays, intersectsDay, limaDate, limaInput } from './agenda';
import { safeReturnUrl } from '../../../core/auth/domain/session';
describe('Calendario de Lima', () => {
  it('la semana comienza el lunes y cruza el año', () => {
    const days = calendarDays('2027-01-01', 'week');
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-12-28');
    expect(days[6]).toBe('2027-01-03');
  });
  it('mes usa 42 días y admite febrero bisiesto', () => {
    const days = calendarDays('2028-02-29', 'month');
    expect(days).toHaveLength(42);
    expect(days).toContain('2028-02-29');
    expect(days[0]).toBe('2028-01-31');
  });
  it.each(['', '2026-02-29', '2026-13-01', '2026-2-01'])('rechaza fecha inválida %s', (date) =>
    expect(() => calendarDays(date, 'day')).toThrow(),
  );
  it('medianoche y rangos semiabiertos en Lima', () => {
    expect(limaDate('2026-11-13T02:00:00Z')).toBe('2026-11-12');
    const row = { inicio_en: '2026-11-12T23:30:00-05:00', fin_en: '2026-11-13T00:00:00-05:00' };
    expect(intersectsDay(row, '2026-11-12')).toBe(true);
    expect(intersectsDay(row, '2026-11-13')).toBe(false);
  });
  it('datetime-local nunca usa zona del navegador', () =>
    expect(limaInput('2026-11-30T09:30')).toBe('2026-11-30T09:30:00-05:00'));
  it.each(['2026-11-30T24:00', '2026-11-30T09:60', '2026-02-30T09:00'])(
    'rechaza horario inválido %s',
    (value) => expect(() => limaInput(value)).toThrow(),
  );
  it('retorno a rutas privadas admite solo estructura conocida', () => {
    expect(safeReturnUrl('/admin/agenda/citas/42')).toBe('/admin/agenda/citas/42');
    expect(safeReturnUrl('/admin/agenda/lista-espera/42')).toBe('/admin/agenda/lista-espera/42');
    expect(safeReturnUrl('//evil.test')).toBe('/admin');
    expect(safeReturnUrl('/admin/agenda/citas/42?token=secret')).toBe('/admin');
  });
});
