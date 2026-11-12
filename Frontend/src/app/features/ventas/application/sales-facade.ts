import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RecordState } from '../../../shared/application/operation-state';
import { PagedState } from '../../../shared/application/paged-state';
import { FinanceApi } from '../infrastructure/finance-api';
import { FinancialIntent } from './financial-intent';
import {
  ConsumptionGroup,
  SaleDetail,
  SaleInput,
  SalePreview,
  PaymentInput,
  Advance,
} from '../domain/sale';
import { InventoryApi } from '../../inventario/infrastructure/inventory-api';
import { StockItem } from '../../inventario/domain/inventory';
import { SessionStore } from '../../../core/auth/application/session-store';
@Injectable()
export class SalesFacade extends RecordState<SaleDetail> {
  readonly api = inject(FinanceApi);
  readonly intent = inject(FinancialIntent);
  private readonly inventory = inject(InventoryApi);
  private readonly session = inject(SessionStore);
  readonly list = new PagedState((query) => this.api.sales(query), false);
  readonly payments = new PagedState((query) => this.api.payments(query), false);
  readonly preview = signal<SalePreview | null>(null);
  readonly advances = signal<Advance[]>([]);
  readonly stock = signal<StockItem[]>([]);
  readonly stockError = signal<string | null>(null);
  readonly changing = signal(false);
  get(id: number) {
    this.stock.set([]);
    this.stockError.set(null);
    this.preview.set(null);
    this.advances.set([]);
    this.payments.filter({ venta: id });
    return this.load(this.api.sale(id));
  }
  async previewSale(groups?: ConsumptionGroup[]) {
    const id = this.record()?.id;
    if (!id || this.busy() || this.changing()) return null;
    const preview = await this.run(this.api.preview(id, groups));
    this.preview.set(preview);
    return preview;
  }
  async mutate(
    operation: string,
    action: string,
    body: unknown,
    method: 'POST' | 'PATCH' = 'POST',
  ) {
    const id = this.record()?.id;
    if (!id || this.changing()) return false;
    this.changing.set(true);
    this.preview.set(null);
    try {
      const result = await this.intent.send(
        operation,
        String(id),
        '/api/ventas/' + id + '/' + action,
        body,
        method,
      );
      // Always obtain current values. Idempotent responses contain the original balance.
      await this.get(id);
      if (result && this.record())
        this.success.set(
          'Operación confirmada. Importes y estado consultados nuevamente en Django.',
        );
      else if (result) {
        this.success.set(null);
        this.error.set(
          'La operación fue registrada, pero no se pudo consultar su estado actual. Vuelve a consultar la venta antes de continuar.',
        );
      }
      return result !== null;
    } finally {
      this.changing.set(false);
    }
  }
  save(body: SaleInput) {
    return this.mutate('venta.editar', '', body, 'PATCH');
  }
  async confirm(groups: ConsumptionGroup[]) {
    const ok = await this.mutate('venta.confirmar', 'confirmar/', {
      consumos_revisados: true,
      consumos_reales: groups,
    });
    if (ok && this.session.hasPermission('negocio.view_articulos')) await this.refreshStock();
    return ok;
  }
  pay(body: PaymentInput) {
    return this.mutate('pago.registrar', 'pagar/', body);
  }
  async voidPayment(payment: number, motivo: string) {
    const id = this.record()?.id;
    if (!id || this.changing()) return;
    this.changing.set(true);
    try {
      await this.intent.send('pago.anular', String(payment), '/api/pagos/' + payment + '/anular/', {
        motivo,
        error_registro_confirmado: true,
      });
      await this.get(id);
    } finally {
      this.changing.set(false);
    }
  }
  async loadAdvances() {
    const id = this.record()?.id;
    if (!id) return;
    const result = await this.run(this.api.advances(id));
    if (result) this.advances.set(result.anticipos);
  }
  async refreshStock() {
    this.stock.set([]);
    this.stockError.set(null);
    const ids = new Set<number>();
    for (const line of this.record()?.lineas ?? []) {
      if (line.tipo === 'PRODUCTO') ids.add(line.articulo_id);
      for (const row of line.consumos) ids.add(row.articulo_id);
    }
    try {
      const pages = await Promise.all(
        [...ids].map((articulo) =>
          firstValueFrom(this.inventory.stock({ articulo, activo: 'all' })),
        ),
      );
      this.stock.set(pages.flatMap((page) => page.results));
    } catch {
      this.stockError.set(
        'La venta puede estar confirmada, pero no se pudo consultar el stock actual. Reintenta la consulta de existencias.',
      );
    }
  }
}
