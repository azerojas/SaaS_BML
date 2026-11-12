import { inject, Injectable } from '@angular/core';
import { CatalogApi } from '../../catalogo/infrastructure/catalog-api';
import { ClientasApi } from '../../clientas/infrastructure/clientas-api';
import { FinanceApi } from '../infrastructure/finance-api';
import { PagedState } from '../../../shared/application/paged-state';
@Injectable()
export class LookupsFacade {
  private readonly catalog = inject(CatalogApi);
  private readonly clientas = inject(ClientasApi);
  private readonly finance = inject(FinanceApi);
  readonly services = new PagedState(
    (query) => this.catalog.list('servicios', { ...query, activo: 'true' }),
    false,
  );
  readonly articles = new PagedState(
    (query) => this.catalog.list('articulos', { ...query, activo: 'true' }),
    false,
  );
  readonly clients = new PagedState(
    (query) => this.clientas.list({ ...query, activa: 'true' }),
    false,
  );
  readonly professionals = new PagedState((query) => this.finance.professionals(query), false);
}
