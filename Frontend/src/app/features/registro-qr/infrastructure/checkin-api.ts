import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { LOCAL_ERROR_HANDLED, PUBLIC_REQUEST } from '../../../core/http/api-interceptor';
import { ResourceApi } from '../../../shared/infrastructure/resource-api';
import { Query } from '../../../shared/domain/records';
import { Arrival, ArrivalDetail, CheckinConfig, CheckinInput, QrPoint } from '../domain/checkin';
import { Visit } from '../../visitas/domain/visit';
const BASE = '/api/admin/checkin/';
@Injectable({ providedIn: 'root' })
export class CheckinApi {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ResourceApi);
  private readonly publicContext = new HttpContext()
    .set(LOCAL_ERROR_HANDLED, true)
    .set(PUBLIC_REQUEST, true);
  config(token: string) {
    return this.http.get<CheckinConfig>('/api/public/checkin/' + encodeURIComponent(token) + '/', {
      context: this.publicContext,
    });
  }
  submit(token: string, body: CheckinInput) {
    return this.http.post<{ detail: string }>(
      '/api/public/checkin/' + encodeURIComponent(token) + '/',
      body,
      { context: this.publicContext },
    );
  }
  points(query: Query) {
    return this.api.list<QrPoint>(BASE + 'puntos/', query);
  }
  savePoint(body: { nombre?: string; activo?: boolean }, id?: number) {
    return this.api.write<QrPoint>(
      id ? 'PATCH' : 'POST',
      BASE + 'puntos/' + (id ? id + '/' : ''),
      body,
    );
  }
  qr(id: number) {
    return this.api.get<{ enlace: string }>(BASE + 'puntos/' + id + '/qr/');
  }
  arrivals(query: Query) {
    return this.api.list<Arrival>(BASE + 'llegadas/', query);
  }
  arrival(id: number) {
    return this.api.get<ArrivalDetail>(BASE + 'llegadas/' + id + '/');
  }
  manual(clienta_id: number) {
    return this.api.write<ArrivalDetail>('POST', BASE + 'llegadas/', { clienta_id });
  }
  resolve(id: number, action: 'confirmar' | 'rechazar' | 'cancelar', body: unknown) {
    return this.api.write<ArrivalDetail>(
      'POST',
      BASE + 'llegadas/' + id + '/' + action + '/',
      body,
    );
  }
  visit(id: number) {
    return this.api.write<Visit>('POST', BASE + 'llegadas/' + id + '/crear-visita/');
  }
  associate(id: number, visita_id: number) {
    return this.api.write<Visit>('POST', BASE + 'llegadas/' + id + '/asociar-visita/', {
      visita_id,
    });
  }
  link(id: number, cita_id: number) {
    return this.api.write<Visit>('POST', BASE + 'llegadas/' + id + '/enlazar-cita/', { cita_id });
  }
  expire() {
    return this.api.write<{ canceladas: number }>('POST', BASE + 'llegadas/expirar/');
  }
}
