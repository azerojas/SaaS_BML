import { Injectable } from '@angular/core';

export interface VisitFilterValues {
  desde: string;
  hasta: string;
  estado: string;
}
const validDate = (value: unknown): value is string => {
  if (value === '') return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const validFilters = (value: Partial<VisitFilterValues>): value is VisitFilterValues =>
  validDate(value.desde) &&
  validDate(value.hasta) &&
  (!value.desde || !value.hasta || value.desde <= value.hasta) &&
  ['', 'ABIERTA', 'FINALIZADA', 'CANCELADA'].includes(value.estado ?? 'invalid');

@Injectable({ providedIn: 'root' })
export class VisitFilters {
  read(actor: number | undefined, today: string): VisitFilterValues {
    try {
      const value: unknown = JSON.parse(
        sessionStorage.getItem('lasheo.visits.filters.' + actor) ?? 'null',
      );
      if (actor && value && typeof value === 'object' && validFilters(value)) return value;
    } catch {
      /* Storage is optional. */
    }
    return { desde: today, hasta: today, estado: '' };
  }
  save(actor: number | undefined, value: VisitFilterValues) {
    if (!actor || !validFilters(value)) return;
    try {
      sessionStorage.setItem('lasheo.visits.filters.' + actor, JSON.stringify(value));
    } catch {
      /* Keep filtering in memory when storage is unavailable. */
    }
  }
}
