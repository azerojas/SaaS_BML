import { inject, Injectable } from '@angular/core';
import { ResourceApi } from '../../../shared/infrastructure/resource-api';
import { Query } from '../../../shared/domain/records';
import { Supplier } from '../domain/supplier';
@Injectable({ providedIn: 'root' })
export class SuppliersApi {
  private readonly api = inject(ResourceApi);
  list(query: Query) {
    return this.api.list<Supplier>('/api/proveedores/', query);
  }
  get(id: number) {
    return this.api.get<Supplier>('/api/proveedores/' + id + '/');
  }
  save(data: unknown, id?: number) {
    return this.api.write<Supplier>(
      id ? 'PATCH' : 'POST',
      '/api/proveedores/' + (id ? id + '/' : ''),
      data,
    );
  }
  active(id: number, active: boolean) {
    return this.api.write<Supplier>(
      'POST',
      '/api/proveedores/' + id + '/' + (active ? 'reactivar' : 'desactivar') + '/',
    );
  }
}
