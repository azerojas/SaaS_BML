import { inject, Injectable } from '@angular/core';
import { ResourceApi } from '../../../shared/infrastructure/resource-api';
import { Query } from '../../../shared/domain/records';
import { Purchase, PurchaseInput } from '../domain/purchase';
@Injectable({ providedIn: 'root' })
export class PurchasesApi {
  private readonly api = inject(ResourceApi);
  list(query: Query) {
    return this.api.list<Purchase>('/api/compras/', query);
  }
  get(id: number) {
    return this.api.get<Purchase>('/api/compras/' + id + '/');
  }
  create(data: PurchaseInput, key: string) {
    return this.api.write<Purchase>('POST', '/api/compras/', data, { 'Idempotency-Key': key });
  }
  patch(id: number, data: PurchaseInput) {
    return this.api.write<Purchase>('PATCH', '/api/compras/' + id + '/', data);
  }
  receive(id: number) {
    return this.api.write<Purchase>('POST', '/api/compras/' + id + '/recibir/');
  }
  cancel(id: number) {
    return this.api.write<Purchase>('POST', '/api/compras/' + id + '/anular/');
  }
  status(key: string) {
    return this.api.get<{ encontrada: boolean; compra: Purchase | null }>(
      '/api/compras/estado-intento/?clave=' + encodeURIComponent(key),
    );
  }
}
