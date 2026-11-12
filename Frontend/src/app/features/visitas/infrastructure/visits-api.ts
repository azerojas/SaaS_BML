import { inject, Injectable } from '@angular/core';
import { ResourceApi } from '../../../shared/infrastructure/resource-api';
import { Query } from '../../../shared/domain/records';
import { Visit } from '../domain/visit';
@Injectable({ providedIn: 'root' })
export class VisitsApi {
  private readonly api = inject(ResourceApi);
  list(query: Query) {
    return this.api.list<Visit>('/api/visitas/', query);
  }
  get(id: number) {
    return this.api.get<Visit>('/api/visitas/' + id + '/');
  }
}
