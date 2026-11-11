import { inject, Injectable } from '@angular/core';
import { ResourceApi } from '../../../shared/infrastructure/resource-api';
import { Query } from '../../../shared/domain/records';
import {
  Adjustment,
  AdjustmentResult,
  InventorySummary,
  Movement,
  RecipeUse,
  StockItem,
} from '../domain/inventory';
@Injectable({ providedIn: 'root' })
export class InventoryApi {
  private readonly api = inject(ResourceApi);
  stock(query: Query) {
    return this.api.list<StockItem>('/api/inventario/stock/', query);
  }
  summary() {
    return this.api.get<InventorySummary>('/api/inventario/stock/resumen/');
  }
  movements(query: Query) {
    return this.api.list<Movement>('/api/inventario/movimientos/', query);
  }
  alerts(query: Query) {
    return this.api.list<StockItem>('/api/inventario/alertas/', { ...query, tipo: 'bajo_stock' });
  }
  uses(query: Query) {
    return this.api.list<RecipeUse>('/api/inventario/stock/usos-receta/', query);
  }
  adjust(data: Adjustment, key: string) {
    return this.api.write<AdjustmentResult>('POST', '/api/inventario/ajustes/', data, {
      'Idempotency-Key': key,
    });
  }
  status(key: string) {
    return this.api.get<{ encontrado: boolean; resultado: AdjustmentResult | null }>(
      '/api/inventario/ajustes/estado/?clave=' + encodeURIComponent(key),
    );
  }
}
