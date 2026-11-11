import { inject, Injectable } from '@angular/core';
import { ResourceApi } from '../../../shared/infrastructure/resource-api';
import { Query } from '../../../shared/domain/records';
import { PublicCategory, PublicItem, PublicKind } from '../domain/public-catalog';
@Injectable({ providedIn: 'root' })
export class PublicApi {
  private readonly api = inject(ResourceApi);
  list(kind: PublicKind, query: Query) {
    return this.api.list<PublicItem>('/api/catalogo/' + kind + '/', query);
  }
  get(kind: PublicKind, slug: string) {
    return this.api.get<PublicItem>('/api/catalogo/' + kind + '/' + encodeURIComponent(slug) + '/');
  }
  categories(query: Query) {
    return this.api.list<PublicCategory>('/api/catalogo/categorias/', query);
  }
}
