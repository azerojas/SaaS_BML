import { inject, Injectable } from '@angular/core';
import { PagedState } from '../../../shared/application/paged-state';
import { RecordState } from '../../../shared/application/operation-state';
import { SuppliersApi } from '../infrastructure/suppliers-api';
import { Supplier } from '../domain/supplier';
@Injectable()
export class SuppliersFacade extends RecordState<Supplier> {
  private readonly api = inject(SuppliersApi);
  readonly list = new PagedState((query) => this.api.list(query), false);
  get(id: number) {
    return this.load(this.api.get(id));
  }
  async save(data: unknown, id?: number) {
    const saved = await this.run(this.api.save(data, id));
    if (saved) this.record.set(saved);
    return saved;
  }
  async active(active: boolean) {
    const id = this.record()?.id;
    if (!id) return;
    const saved = await this.run(this.api.active(id, active));
    if (saved) {
      this.record.set(saved);
      this.success.set('Estado del proveedor actualizado.');
    }
  }
}
