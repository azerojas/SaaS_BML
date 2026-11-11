import { ValidationSummary } from '../../../shared/ui/validation-summary';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { SessionStore } from '../../../core/auth/application/session-store';
import { PurchasesFacade } from '../application/purchases-facade';
import { pen } from '../../../shared/domain/records';
import { dateLima, unitCost } from '../../inventario/domain/inventory';
import { OperationsNav } from '../../../shared/ui/operations-nav';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Button } from '../../../shared/ui/button';
import { Pager } from '../../../shared/ui/pager';
import { StockCards } from '../../inventario/presentation/stock-ui';
@Component({
  selector: 'bm-purchase-detail',
  imports: [
    ValidationSummary,
    RouterLink,
    MatButtonModule,
    OperationsNav,
    Alert,
    Loading,
    Button,
    Pager,
    StockCards,
  ],
  providers: [PurchasesFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<bm-operations-nav /><a class="back-link" routerLink="/admin/compras">← Compras</a>
    @if (facade.error(); as error) {
      <bm-alert [message]="error" />
    }
    <bm-validation-summary [errors]="facade.fields()" />
    @if (facade.success(); as success) {
      <bm-alert kind="info" [message]="success" />
    }
    @if (facade.loading()) {
      <bm-loading />
    }
    @if (facade.record(); as purchase) {
      <header class="feature-heading">
        <div>
          <p class="eyebrow">
            {{ isReceipt ? 'REVISIÓN ANTES DE RECIBIR' : 'TRAZABILIDAD DE COMPRA' }}
          </p>
          <h1>{{ isReceipt ? 'Recepción de compra #' : 'Compra #' }}{{ purchase.id }}</h1>
          <span class="badge" [class.inactive]="purchase.estado === 'ANULADA'">{{
            purchase.estado
          }}</span>
        </div>
        <div class="form-actions">
          @if (purchase.estado === 'BORRADOR' && session.hasPermission('negocio.change_compras')) {
            <a mat-stroked-button [routerLink]="['/admin/compras', purchase.id, 'editar']"
              >Editar borrador</a
            >
            @if (!isReceipt) {
              <a mat-flat-button [routerLink]="['/admin/compras', purchase.id, 'recepcion']"
                >Preparar recepción</a
              >
            }
            <button
              mat-button
              type="button"
              [disabled]="facade.busy() || confirming()"
              (click)="cancel()"
            >
              Anular borrador
            </button>
          }
        </div>
      </header>
      <section class="surface">
        <dl class="details-grid">
          <div>
            <dt>Documento</dt>
            <dd>{{ purchase.numero_documento || 'Sin documento registrado' }}</dd>
          </div>
          <div>
            <dt>Proveedor</dt>
            <dd>{{ purchase.proveedor_nombre || 'Sin proveedor' }}</dd>
          </div>
          <div>
            <dt>Fecha de compra (Lima)</dt>
            <dd>{{ date(purchase.fecha) }}</dd>
          </div>
          <div>
            <dt>Total oficial (PEN)</dt>
            <dd>
              <strong>{{ money(purchase.total) }}</strong>
            </dd>
          </div>
          <div class="wide">
            <dt>Observaciones</dt>
            <dd class="preserve-lines">{{ purchase.observaciones || 'Sin observaciones' }}</dd>
          </div>
        </dl>
      </section>
      <section class="surface section-gap">
        <h2>Mercadería registrada</h2>
        <div class="purchase-lines-readonly">
          @for (line of purchase.detalles ?? []; track line.id) {
            <article>
              <h3>{{ line.articulo_nombre }}</h3>
              <dl class="details-grid">
                <div>
                  <dt>Cantidad</dt>
                  <dd>{{ line.cantidad }} {{ line.unidad }}</dd>
                </div>
                <div>
                  <dt>Costo unitario (PEN)</dt>
                  <dd>{{ cost(line.costo_unitario) }}</dd>
                </div>
                <div>
                  <dt>Lote de referencia</dt>
                  <dd>{{ line.numero_lote || 'Sin lote' }}</dd>
                </div>
                <div>
                  <dt>Vencimiento de referencia</dt>
                  <dd>{{ line.vencimiento || 'Sin vencimiento' }}</dd>
                </div>
              </dl>
            </article>
          } @empty {
            <p class="muted">La compra está vacía; no se puede recibir.</p>
          }
        </div>
      </section>
      @if (isReceipt && purchase.estado === 'BORRADOR') {
        <section class="surface section-gap">
          <h2>Confirmación de recepción completa</h2>
          <p>
            Comprueba físicamente las cantidades, unidades y vencimientos antes de confirmar. Django
            validará el borrador y creará una entrada por línea en una sola transacción.
          </p>
          <p class="muted">
            No se permiten recepciones parciales ni productos vencidos. Reintentar esta misma compra
            no genera entradas duplicadas.
          </p>
          <bm-button
            [busy]="facade.busy()"
            [disabled]="confirming() || !purchase.detalles?.length"
            (click)="receive()"
            >Confirmar recepción</bm-button
          >
        </section>
      }
      @if (purchase.estado === 'RECIBIDA' && session.hasPermission('negocio.view_articulos')) {
        <section class="surface section-gap">
          <h2>Existencias actuales después de consultar</h2>
          <p class="muted">
            Stock actual de los artículos de esta compra, no saldo de un lote específico.
          </p>
          @if (facade.stock.error(); as error) {
            <bm-alert [message]="error" /><button mat-button (click)="facade.stock.reload()">
              Reintentar stock recibido
            </button>
          }
          @if (facade.stock.loading()) {
            <bm-loading />
          } @else {
            <bm-stock-cards [rows]="facade.stock.rows()" />
          }
          <bm-pager
            [count]="facade.stock.count()"
            [page]="Number(facade.stock.query()['page'])"
            [busy]="facade.stock.loading()"
            (changed)="facade.stock.page($event)"
          />
        </section>
      }
      @if (session.hasPermission('negocio.view_movimientosinventario')) {
        <a
          class="back-link section-gap"
          routerLink="/admin/inventario/movimientos"
          [queryParams]="{ compra: purchase.id }"
          >Ver movimientos de esta compra →</a
        >
      }
    } `,
})
export class PurchaseDetail {
  readonly facade = inject(PurchasesFacade);
  readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  readonly confirming = signal(false);
  readonly isReceipt = this.route.snapshot.data['receipt'] === true;
  readonly money = pen;
  readonly cost = unitCost;
  readonly date = dateLima;
  readonly Number = Number;
  constructor() {
    void this.init();
  }
  private async init() {
    await this.facade.get(Number(this.route.snapshot.paramMap.get('id')));
    if (
      this.facade.record()?.estado === 'RECIBIDA' &&
      this.session.hasPermission('negocio.view_articulos')
    )
      this.facade.stock.reload();
  }
  async receive() {
    if (this.confirming() || this.facade.busy()) return;
    this.confirming.set(true);
    try {
      const accepted = await firstValueFrom(
        this.dialog
          .open(ConfirmDialog, {
            data: {
              title: '¿Confirmar recepción de mercadería?',
              description:
                'Se registrarán las entradas de todas las líneas. Verifica que coincidan con lo recibido físicamente.',
              confirm: 'Recibir compra',
            },
          })
          .afterClosed(),
      );
      if (accepted) await this.facade.receive();
    } finally {
      this.confirming.set(false);
    }
  }
  async cancel() {
    if (this.confirming() || this.facade.busy()) return;
    this.confirming.set(true);
    try {
      const accepted = await firstValueFrom(
        this.dialog
          .open(ConfirmDialog, {
            data: {
              title: '¿Anular este borrador?',
              description:
                'Se conservará la compra anulada; no se generarán entradas ni se modificará el stock.',
              confirm: 'Anular compra',
            },
          })
          .afterClosed(),
      );
      if (accepted) await this.facade.cancel();
    } finally {
      this.confirming.set(false);
    }
  }
}
