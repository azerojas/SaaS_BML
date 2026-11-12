import { describe, it, expect } from 'vitest';
import { money } from './analytics';
import { limaToday, presetFilters, analyticsQuery, validateFilters, validDate } from './periods';
import { overviewAdapter, seriesAdapter, envelope } from '../infrastructure/analytics-adapters';
import { overviewFixture, seriesFixture, envelopeFixture } from '../tests/fixtures';
describe('períodos locales y representación financiera sin recálculo', () => {
  it('usa el día de Lima aunque UTC ya esté en el siguiente', () => {
    expect(limaToday(new Date('2026-11-12T02:00:00Z'))).toBe('2026-11-11');
  });
  it('traduce fecha final inclusiva a límite exclusivo sin 23:59:59', () => {
    expect(
      analyticsQuery({
        preset: 'custom',
        desde: '2026-10-01',
        hasta: '2026-10-31',
        granularidad: 'day',
      }),
    ).toEqual({
      desde: '2026-10-01',
      hasta: '2026-11-01',
      granularidad: 'day',
      timezone: 'America/Lima',
    });
  });
  it('resuelve semana, últimos siete días, cambio de año y febrero bisiesto', () => {
    expect(presetFilters('week', '2026-11-11')).toMatchObject({
      desde: '2026-11-09',
      hasta: '2026-11-15',
    });
    expect(presetFilters('last7', '2026-11-11').desde).toBe('2026-11-05');
    expect(presetFilters('previousmonth', '2026-01-05')).toMatchObject({
      desde: '2025-12-01',
      hasta: '2025-12-31',
    });
    expect(presetFilters('previousmonth', '2024-03-01').hasta).toBe('2024-02-29');
  });
  it('rechaza fechas imposibles, rangos invertidos y rangos superiores al contrato', () => {
    expect(validDate('2026-02-30')).toBe(false);
    expect(
      validateFilters({
        preset: 'custom',
        desde: '2026-11-02',
        hasta: '2026-11-01',
        granularidad: 'day',
      }),
    ).not.toBeNull();
    expect(
      validateFilters({
        preset: 'custom',
        desde: '2020-01-01',
        hasta: '2026-01-01',
        granularidad: 'day',
      }),
    ).not.toBeNull();
    expect(
      validateFilters({
        preset: 'custom',
        desde: '2020-01-01',
        hasta: '2026-01-01',
        granularidad: 'month',
      }),
    ).toBeNull();
  });
  it('formatea exactamente dinero decimal grande, negativo y null', () => {
    expect(money('9999999999999999.99')).toBe('S/ 9,999,999,999,999,999.99');
    expect(money('-2.50')).toBe('−S/ 2.50');
    expect(money(null)).toBe('No disponible');
    expect(money('0.00')).toBe('S/ 0.00');
    expect(money(5)).toBe('No disponible');
  });
  it('no habilita caja neta ni utilidad cuando las banderas del servidor lo impiden', () => {
    const source = overviewFixture();
    source.indicadores = { ...source.indicadores, dinero_recaudado: '100.00' };
    source.utilidad_estimada_habilitada = false;
    expect(overviewAdapter(source).indicadores['dinero_recaudado']).toBeNull();
    expect(overviewAdapter(source).indicadores['utilidad_estimada']).toBeNull();
    source.calidad = {
      ...source.calidad,
      recaudacion_conciliada: true,
      dinero_recaudado_habilitado: true,
    };
    source.utilidad_estimada_habilitada = true;
    expect(overviewAdapter(source).indicadores['dinero_recaudado']).toBe('100.00');
  });
  it('conserva los importes de la serie y rechaza moneda o importes incompatibles', () => {
    expect(seriesAdapter(seriesFixture()).results[0].cobros_registrados).toBe('20.00');
    expect(() =>
      envelope({ ...envelopeFixture, periodo: { ...envelopeFixture.periodo, moneda: 'USD' } }),
    ).toThrow();
    const source = seriesFixture();
    expect(() =>
      seriesAdapter({ ...source, results: [{ ...source.results[0], ventas_confirmadas: 95.0 }] }),
    ).toThrow();
  });
});
