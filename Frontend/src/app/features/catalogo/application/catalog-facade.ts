import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RecordState } from '../../../shared/application/operation-state';
import { PagedState } from '../../../shared/application/paged-state';
import { CatalogRecord, Kind } from '../domain/catalog';
import { CatalogApi } from '../infrastructure/catalog-api';
@Injectable()
export class CatalogFacade extends RecordState<CatalogRecord> {
  readonly api = inject(CatalogApi);
  readonly kind = signal<Kind>('servicios');
  readonly list = new PagedState((query) => this.api.list(this.kind(), query), false);
  configure(kind: Kind, list = false) {
    this.kind.set(kind);
    if (list) this.list.filter({});
  }
  get(id: number) {
    return this.load(this.api.get(this.kind(), id));
  }
  async save(data: unknown, id?: number, photo?: File | null) {
    const saved = await this.run(this.api.save(this.kind(), data, id, photo));
    if (saved) this.record.set(saved);
    return saved;
  }
  async active(active: boolean) {
    const id = this.record()?.id;
    if (!id) return;
    const saved = await this.run(this.api.active(this.kind(), id, active));
    if (saved) {
      this.record.set(saved);
      this.success.set('Estado actualizado.');
    }
  }
  async lookup(id: number) {
    return firstValueFrom(this.api.get(this.kind(), id));
  }
}
