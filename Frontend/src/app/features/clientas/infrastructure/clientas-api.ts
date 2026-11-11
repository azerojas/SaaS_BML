import { inject, Injectable } from '@angular/core';
import { ResourceApi } from '../../../shared/infrastructure/resource-api';
import { Query } from '../../../shared/domain/records';
import { Clienta } from '../domain/clienta';
const BASE = '/api/clientas/';
@Injectable({ providedIn: 'root' })
export class ClientasApi {
  private readonly api = inject(ResourceApi);
  list(query: Query) {
    return this.api.list<Clienta>(BASE, query);
  }
  get(id: number) {
    return this.api.get<Clienta>(BASE + id + '/');
  }
  save(data: unknown, id?: number) {
    return this.api.write<Clienta>(id ? 'PATCH' : 'POST', BASE + (id ? id + '/' : ''), data);
  }
  active(id: number, active: boolean) {
    return this.api.write<Clienta>(
      'POST',
      BASE + id + '/' + (active ? 'reactivar' : 'desactivar') + '/',
    );
  }
  consent(id: number, data: { otorgado: boolean; evidencia: string; version_aviso: string }) {
    return this.api.write<Clienta>('POST', BASE + id + '/consentimiento/', data);
  }
  config() {
    return this.api.config();
  }
}
