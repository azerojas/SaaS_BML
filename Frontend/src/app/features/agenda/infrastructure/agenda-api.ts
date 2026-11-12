import { inject, Injectable } from '@angular/core';
import { EMPTY, expand, map, reduce, switchMap, from, mergeMap, toArray, of } from 'rxjs';
import { ResourceApi } from '../../../shared/infrastructure/resource-api';
import { Query } from '../../../shared/domain/records';
import {
  Appointment,
  AppointmentDetail,
  Availability,
  MutationResult,
  WriteMethod,
  Advance,
} from '../domain/agenda';
const BASE = '/api/v1/agenda/';
@Injectable({ providedIn: 'root' })
export class AgendaApi {
  readonly resource = inject(ResourceApi);
  get<T>(path: string) {
    return this.resource.get<T>(BASE + path);
  }
  /** Bounded, cancelable pagination. Incomplete calendars are errors, never free slots. */
  all<T>(path: string, query: Query = {}) {
    return this.allAt<T>(BASE + path, query);
  }
  allAt<T>(path: string, query: Query = {}) {
    let page = 1;
    return this.resource.list<T>(path, { ...query, page_size: 100, page }).pipe(
      expand((response) => {
        if (!response.next) return EMPTY;
        if (++page > 20)
          throw new Error(
            'La consulta supera 2000 registros. Reduce el rango o filtra por profesional.',
          );
        return this.resource.list<T>(path, { ...query, page_size: 100, page });
      }),
      reduce((rows: T[], response) => rows.concat(response.results), []),
    );
  }
  calendar(query: Query, service: number | null) {
    return this.all<Appointment>('calendario/', query).pipe(
      switchMap((rows) =>
        service
          ? rows.length
            ? from(rows).pipe(
                mergeMap((row) => this.get<AppointmentDetail>('citas/' + row.id + '/'), 6),
                toArray(),
                map((details) =>
                  details
                    .sort((a, b) => a.inicio_en.localeCompare(b.inicio_en) || a.id - b.id)
                    .filter((row) => row.servicios.some((item) => item.servicio_id === service)),
                ),
              )
            : of([])
          : of(rows),
      ),
    );
  }
  availability(date: string, professional: number, services: number[]) {
    return this.get<Availability>(
      'calendario/disponibilidad/?' +
        new URLSearchParams({
          fecha: date,
          profesional_id: String(professional),
          servicios: services.join(','),
        }),
    );
  }
  advances(id: number) {
    return this.allAt<Advance>('/api/anticipos/', { cita: id }).pipe(
      map((rows) => {
        if (rows.some((row) => row.cita_id !== id))
          throw new Error(
            'Django devolvió anticipos de otra cita. Operación bloqueada; solicita revisión.',
          );
        return rows;
      }),
    );
  }
  mutate(path: string, body: unknown, key: string, method: WriteMethod = 'POST') {
    return this.resource.write<MutationResult>(method, path, body, { 'Idempotency-Key': key });
  }
  path(path: string) {
    return BASE + path;
  }
}
