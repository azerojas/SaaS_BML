import { ValidationSummary } from '../../../shared/ui/validation-summary';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { Icon } from '../../../shared/ui/icon';
import { PurchaseForm } from './purchase-form';
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
    MatDialogModule,
    Icon,
  ],
  providers: [PurchasesFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div [class.purchase-modal]="dialogRef">
    @if (dialogRef) {
      <header class="preview-heading">
        <span class="toolbar-icon"><bm-icon name="receipt" /></span>
        <div>
          <p class="modal-eyebrow">LASHEO · COMPRAS</p>
          <h2 mat-dialog-title>Detalle de compra</h2>
        </div>
        <button
          mat-icon-button
          type="button"
          [disabled]="facade.busy() || confirming()"
          (click)="dialogRef.close()"
          aria-label="Cerrar compra"
        >
          <bm-icon name="close" />
        </button>
      </header>
    } @else {
      <bm-operations-nav /><a class="back-link" routerLink="/admin/compras">← Compras</a>
    }
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
      <header class="feature-heading purchase-hero">
        @if (dialogRef) {
          <span class="hero-icon"><bm-icon name="box" /></span>
        }
        <div>
          <p class="eyebrow">
            {{ isReceipt ? 'REVISIÓN ANTES DE RECIBIR' : 'TRAZABILIDAD DE COMPRA' }}
          </p>
          <h1>{{ isReceipt ? 'Recepción de compra #' : 'Compra #' }}{{ purchase.id }}</h1>
          <span class="badge" [class.inactive]="purchase.estado === 'ANULADA'">{{
            purchase.estado
          }}</span>
        </div>
        @if (dialogRef) {
          <div class="hero-total">
            <span>Total de la compra</span><strong>{{ money(purchase.total) }}</strong
            ><small
              >{{ purchase.detalles?.length ?? 0 }}
              {{
                purchase.detalles?.length === 1 ? 'artículo registrado' : 'artículos registrados'
              }}</small
            >
          </div>
        }
        <div class="form-actions">
          @if (purchase.estado === 'BORRADOR' && session.hasPermission('negocio.change_compras')) {
            @if (dialogRef) {
              <button
                mat-stroked-button
                type="button"
                (click)="editDraft(purchase.id)"
                [disabled]="facade.busy()"
              >
                Editar borrador
              </button>
            } @else {
              <a mat-stroked-button [routerLink]="['/admin/compras', purchase.id, 'editar']"
                >Editar borrador</a
              >
            }
            @if (!isReceipt && !dialogRef) {
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
      @if (dialogRef && purchase.estado !== 'ANULADA') {
        <ol class="purchase-progress" aria-label="Seguimiento de la compra">
          <li class="done">
            <span><bm-icon name="check" /></span>
            <div><strong>Compra registrada</strong><small>Documento guardado</small></div>
          </li>
          <li [class.done]="purchase.estado === 'RECIBIDA'">
            <span><bm-icon [name]="purchase.estado === 'RECIBIDA' ? 'check' : 'box'" /></span>
            <div>
              <strong>Mercadería recibida</strong
              ><small>{{
                purchase.estado === 'RECIBIDA' ? 'Recepción confirmada' : 'Pendiente de recibir'
              }}</small>
            </div>
          </li>
          <li [class.done]="purchase.estado === 'RECIBIDA'">
            <span><bm-icon [name]="purchase.estado === 'RECIBIDA' ? 'check' : 'chart'" /></span>
            <div>
              <strong>Inventario actualizado</strong
              ><small>{{
                purchase.estado === 'RECIBIDA'
                  ? 'Entradas registradas'
                  : 'Al confirmar la recepción'
              }}</small>
            </div>
          </li>
        </ol>
      }
      <section class="surface purchase-information">
        @if (dialogRef) {
          <div class="section-title">
            <span><bm-icon name="receipt" /></span>
            <h2>Datos de la compra</h2>
          </div>
        }
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
          @if (!dialogRef) {
            <div>
              <dt>Total oficial (PEN)</dt>
              <dd>
                <strong>{{ money(purchase.total) }}</strong>
              </dd>
            </div>
          }
          <div class="wide">
            <dt>Observaciones</dt>
            <dd class="preserve-lines">{{ purchase.observaciones || 'Sin observaciones' }}</dd>
          </div>
        </dl>
      </section>
      <section class="surface section-gap merchandise-panel">
        <div class="section-title">
          <span><bm-icon name="box" /></span>
          <h2>Mercadería registrada</h2>
        </div>
        <div class="purchase-lines-readonly">
          @for (line of purchase.detalles ?? []; track line.id) {
            <article>
              <div class="line-title">
                <span class="item-icon"><bm-icon name="box" /></span>
                <div>
                  <h3>{{ line.articulo_nombre }}</h3>
                  <span class="unit-label">Unidad: {{ line.unidad }}</span>
                </div>
              </div>
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
      @if (
        (isReceipt || dialogRef) &&
        purchase.estado === 'BORRADOR' &&
        session.hasPermission('negocio.change_compras')
      ) {
        <section class="surface section-gap receipt-review">
          <div class="section-title">
            <span><bm-icon name="check" /></span>
            <h2>Confirmación de recepción completa</h2>
          </div>
          <p>
            Revisa las cantidades, unidades y vencimientos de la mercadería recibida. Al confirmar,
            se registran las entradas y se actualizan las existencias.
          </p>
          <p class="muted">
            Cada compra se recibe completa una sola vez. Los productos vencidos no se pueden
            recibir.
          </p>
          <bm-button
            [busy]="facade.busy()"
            [disabled]="confirming() || !purchase.detalles?.length"
            (click)="receive()"
            >Confirmar recepción</bm-button
          >
        </section>
      }
      @if (
        !dialogRef &&
        purchase.estado === 'RECIBIDA' &&
        session.hasPermission('negocio.view_articulos')
      ) {
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
      @if (!dialogRef && session.hasPermission('negocio.view_movimientosinventario')) {
        <a
          class="back-link section-gap"
          routerLink="/admin/inventario/movimientos"
          [queryParams]="{ compra: purchase.id }"
          >Ver movimientos de esta compra →</a
        >
      }
    }
  </div>`,
  styleUrl: './purchase-detail.scss',
})
export class PurchaseDetail {
  readonly facade = inject(PurchasesFacade);
  readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  readonly dialogRef = inject<MatDialogRef<PurchaseDetail>>(MatDialogRef, { optional: true });
  private readonly dialogData = inject<{ id: number }>(MAT_DIALOG_DATA, { optional: true });
  readonly confirming = signal(false);
  readonly isReceipt = !this.dialogRef && this.route.snapshot.data['receipt'] === true;
  readonly money = pen;
  readonly cost = unitCost;
  readonly date = dateLima;
  readonly Number = Number;
  constructor() {
    void this.init();
  }
  private async init() {
    await this.facade.get(this.dialogData?.id ?? Number(this.route.snapshot.paramMap.get('id')));
    if (
      this.facade.record()?.estado === 'RECIBIDA' &&
      this.session.hasPermission('negocio.view_articulos')
    )
      this.facade.stock.reload();
  }
  async editDraft(id: number) {
    if (!this.session.hasPermission('negocio.change_compras')) return;
    const saved = await firstValueFrom(
      this.dialog
        .open(PurchaseForm, {
          data: { id },
          width: '1000px',
          maxWidth: '96vw',
          disableClose: true,
          autoFocus: 'first-heading',
        })
        .afterClosed(),
    );
    if (saved) await this.facade.get(id);
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
