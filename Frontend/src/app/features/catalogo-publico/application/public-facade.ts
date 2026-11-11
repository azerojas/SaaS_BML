import { inject, Injectable, signal } from '@angular/core';
import { RecordState } from '../../../shared/application/operation-state';
import { PagedState } from '../../../shared/application/paged-state';
import { PublicApi } from '../infrastructure/public-api';
import { PublicItem, PublicKind } from '../domain/public-catalog';
@Injectable()
export class PublicFacade extends RecordState<PublicItem> {
  private readonly api = inject(PublicApi);
  readonly kind = signal<PublicKind>('servicios');
  readonly list = new PagedState((query) => this.api.list(this.kind(), query), false);
  readonly categories = new PagedState((query) => this.api.categories(query), false);
  initialize() {
    this.list.reload();
    this.categories.reload();
  }
  select(kind: PublicKind) {
    const search = this.list.query()['search'] ?? '';
    this.kind.set(kind);
    this.list.query.set({ page: 1, page_size: 20, search });
    this.list.reload();
  }
  get(kind: PublicKind, slug: string) {
    this.kind.set(kind);
    return this.load(this.api.get(kind, slug));
  }
}
