import { AnalyticsFilters, Preset } from './analytics';
import { Query } from '../../../shared/domain/records';
export function limaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return part('year') + '-' + part('month') + '-' + part('day');
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '9997-12-31')
    return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
/** Calendar arithmetic only. API boundaries remain local midnights computed by Django. */
export function addDays(value: string, days: number): string {
  const date = new Date(value + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function presetFilters(preset: Preset, today = limaToday()): AnalyticsFilters {
  let desde = today;
  let hasta = today;
  if (preset === 'last7') desde = addDays(today, -6);
  if (preset === 'week') {
    const weekday = new Date(today + 'T12:00:00Z').getUTCDay();
    desde = addDays(today, -((weekday + 6) % 7));
    hasta = addDays(desde, 6);
  }
  if (preset === 'month') desde = today.slice(0, 7) + '-01';
  if (preset === 'previousmonth') {
    hasta = addDays(today.slice(0, 7) + '-01', -1);
    desde = hasta.slice(0, 7) + '-01';
  }
  return { preset, desde, hasta, granularidad: 'day' };
}
export function validateFilters(filters: AnalyticsFilters): string | null {
  if (!validDate(filters.desde) || !validDate(filters.hasta) || filters.desde > filters.hasta)
    return 'Selecciona un rango válido: la fecha inicial no puede superar la final.';
  if (!['day', 'week', 'month'].includes(filters.granularidad))
    return 'Selecciona una agrupación válida.';
  const length = (Date.parse(addDays(filters.hasta, 1)) - Date.parse(filters.desde)) / 86400000;
  if (length > (filters.granularidad === 'day' ? 366 : 3660))
    return 'El rango máximo es 366 días para agrupación diaria y 3660 para semanal o mensual.';
  return null;
}
export function analyticsQuery(filters: AnalyticsFilters): Query {
  const error = validateFilters(filters);
  if (error) throw new Error(error);
  return {
    desde: filters.desde,
    hasta: addDays(filters.hasta, 1),
    granularidad: filters.granularidad,
    timezone: 'America/Lima',
  };
}
