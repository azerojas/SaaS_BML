import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, map } from 'rxjs';
import { PagedState } from '../../../shared/application/paged-state';
import { RecordState } from '../../../shared/application/operation-state';
import { IntentState } from '../../../shared/application/intent-state';
import { SessionStore } from '../../../core/auth/application/session-store';
import { messageOf } from '../../../shared/domain/records';
import { InventoryApi } from '../infrastructure/inventory-api';
import { Adjustment, AdjustmentResult, InventorySummary, StockItem } from '../domain/inventory';
@Injectable()
export class InventoryFacade extends RecordState<StockItem> {
  private readonly api = inject(InventoryApi);
  private readonly session = inject(SessionStore);
  readonly summary = signal<InventorySummary | null>(null);
  readonly summaryError = signal<string | null>(null);
  readonly stock = new PagedState((query) => this.api.stock(query), false);
  readonly movements = new PagedState((query) => this.api.movements(query), false);
  readonly alerts = new PagedState((query) => this.api.alerts(query), false);
  readonly uses = new PagedState((query) => this.api.uses(query), false);
  readonly adjustment = new IntentState<Adjustment, AdjustmentResult>(
    'adjustment',
    this.session.currentUser()!.id,
  );
  async overview() {
    this.summaryError.set(null);
    try {
      this.summary.set(await firstValueFrom(this.api.summary()));
    } catch (error: unknown) {
      this.summaryError.set(messageOf(error));
    }
  }
  article(id: number) {
    return this.load(
      this.api.stock({ articulo: id, activo: 'all', page_size: 1 }).pipe(
        map((response) => {
          if (!response.results.length) throw new Error('Artículo no disponible.');
          return response.results[0];
        }),
      ),
    );
  }
  async recover() {
    const key = this.adjustment.key();
    if (!key) return;
    const response = await this.adjustment.run(this.api.status(key));
    if (!response) return;
    if (response.encontrado && response.resultado) {
      this.adjustment.accept(response.resultado);
      await this.article(response.resultado.articulo_id);
    } else this.adjustment.notFound();
  }
  async adjust(data: Adjustment) {
    const result = await this.adjustment.send(data, (body, key) => this.api.adjust(body, key));
    if (result) await this.article(result.articulo_id);
    return result;
  }
  retry() {
    const body = this.adjustment.body();
    return body ? this.adjust(body) : Promise.resolve(null);
  }
}
