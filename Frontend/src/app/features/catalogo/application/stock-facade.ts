import { inject, Injectable } from '@angular/core';
import { RecordState } from '../../../shared/application/operation-state';
import { Page } from '../../../shared/domain/records';
import { Stock } from '../domain/catalog';
import { CatalogApi } from '../infrastructure/catalog-api';
@Injectable()
export class StockFacade extends RecordState<Page<Stock>> {
  private readonly api = inject(CatalogApi);
  get(id: number) {
    return this.load(this.api.stock(id));
  }
}
