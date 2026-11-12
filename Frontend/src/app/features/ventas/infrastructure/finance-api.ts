import { inject, Injectable } from '@angular/core';
import { ResourceApi } from '../../../shared/infrastructure/resource-api';
import { Query } from '../../../shared/domain/records';
import {
  Advance,
  FinanceResult,
  IntentResult,
  Payment,
  Professional,
  Sale,
  SaleDetail,
  SalePreview,
  ConsumptionGroup,
} from '../domain/sale';
@Injectable({ providedIn: 'root' })
export class FinanceApi {
  private readonly api = inject(ResourceApi);
  sales(query: Query) {
    return this.api.list<Sale>('/api/ventas/', query);
  }
  sale(id: number) {
    return this.api.get<SaleDetail>('/api/ventas/' + id + '/');
  }
  preview(id: number, consumos_reales?: ConsumptionGroup[]) {
    return this.api.write<SalePreview>(
      'POST',
      '/api/ventas/' + id + '/previsualizar/',
      consumos_reales ? { consumos_reales } : {},
    );
  }
  payments(query: Query) {
    return this.api.list<Payment>('/api/pagos/', query);
  }
  advances(id: number) {
    return this.api.get<{ anticipos: Advance[] }>('/api/ventas/' + id + '/anticipos-aplicables/');
  }
  professionals(query: Query) {
    return this.api.list<Professional>('/api/ventas/profesionales/', query);
  }
  mutate(path: string, body: unknown, key: string, method: 'POST' | 'PATCH' = 'POST') {
    return this.api.write<FinanceResult>(method, path, body, { 'Idempotency-Key': key });
  }
  status(key: string, operation: string) {
    return this.api.get<IntentResult>(
      '/api/finanzas/intentos/' +
        encodeURIComponent(key) +
        '/?operacion=' +
        encodeURIComponent(operation),
    );
  }
}
