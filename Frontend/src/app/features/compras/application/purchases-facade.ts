import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PagedState } from '../../../shared/application/paged-state';
import { RecordState } from '../../../shared/application/operation-state';
import { IntentState } from '../../../shared/application/intent-state';
import { SessionStore } from '../../../core/auth/application/session-store';
import { messageOf } from '../../../shared/domain/records';
import { InventoryApi } from '../../inventario/infrastructure/inventory-api';
import { Purchase, PurchaseInput } from '../domain/purchase';
import { PurchasesApi } from '../infrastructure/purchases-api';
@Injectable()
export class PurchasesFacade extends RecordState<Purchase> {
  private readonly api = inject(PurchasesApi);
  private readonly inventory = inject(InventoryApi);
  private readonly session = inject(SessionStore);
  readonly creation = new IntentState<PurchaseInput, Purchase>(
    'purchase',
    this.session.currentUser()!.id,
  );
  readonly list = new PagedState((query) => this.api.list(query), false);
  readonly depleted = new PagedState(
    (query) => this.inventory.stock({ ...query, activo: 'true', agotados: 'true' }),
    false,
  );
  readonly stock = new PagedState(
    (query) => this.inventory.stock({ ...query, compra: this.record()!.id, activo: 'all' }),
    false,
  );
  get(id: number) {
    return this.load(this.api.get(id));
  }
  async recover() {
    const key = this.creation.key();
    if (!key) return null;
    const response = await this.creation.run(this.api.status(key));
    if (!response) return null;
    if (response.encontrada && response.compra) {
      this.creation.accept(response.compra);
      return response.compra;
    }
    this.creation.notFound();
    return null;
  }
  create(data: PurchaseInput) {
    return this.creation.send(data, (body, key) => this.api.create(body, key));
  }
  async retry() {
    const body = this.creation.body();
    return body ? this.create(body) : null;
  }
  async save(id: number, data: PurchaseInput) {
    return this.run(this.api.patch(id, data));
  }
  async receive() {
    const id = this.record()?.id;
    if (!id) return;
    const result = await this.run(this.api.receive(id));
    if (result) {
      this.record.set(result);
      this.success.set('Recepción confirmada por Django. El stock se volvió a consultar.');
      this.stock.reload();
    } else await this.refresh();
  }
  async cancel() {
    const id = this.record()?.id;
    if (!id) return;
    const result = await this.run(this.api.cancel(id));
    if (result) {
      this.record.set(result);
      this.success.set('Compra anulada. No se generaron entradas.');
    } else await this.refresh();
  }
  private async refresh() {
    const id = this.record()?.id;
    if (!id) return;
    try {
      const result = await firstValueFrom(this.api.get(id));
      this.record.set(result);
      if (result.estado === 'RECIBIDA') this.stock.reload();
    } catch (error: unknown) {
      this.error.set(messageOf(error));
    }
  }
}
