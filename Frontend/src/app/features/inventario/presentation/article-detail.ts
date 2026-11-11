import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SessionStore } from '../../../core/auth/application/session-store';
import { InventoryFacade } from '../application/inventory-facade';
import { stockStatus, unitCost } from '../domain/inventory';
import { OperationsNav } from '../../../shared/ui/operations-nav';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Pager } from '../../../shared/ui/pager';
import { MovementCards } from './stock-ui';
@Component({
  selector: 'bm-inventory-article',
  imports: [RouterLink, MatButtonModule, OperationsNav, Alert, Loading, Pager, MovementCards],
  providers: [InventoryFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<bm-operations-nav /><a class="back-link" routerLink="/admin/inventario"
      >← Existencias</a
    >
    @if (facade.error(); as error) {
      <bm-alert [message]="error" />
    }
    @if (facade.loading()) {
      <bm-loading />
    }
    @if (facade.record(); as row) {
      <header class="feature-heading">
        <div>
          <p class="eyebrow">{{ row.tipo }} · {{ row.sku || 'SIN SKU' }}</p>
          <h1>{{ row.nombre }}</h1>
          <span class="badge" [class.inactive]="row.bajo_minimo">{{ status(row) }}</span>
        </div>
        <div class="form-actions">
          <a mat-stroked-button [routerLink]="['/admin/catalogo/articulos', row.articulo_id]"
            >Ficha del catálogo</a
          >
          @if (canAdjust()) {
            <a
              mat-flat-button
              routerLink="/admin/inventario/ajustes/nuevo"
              [queryParams]="{ articulo: row.articulo_id }"
              >Ajustar existencias</a
            >
          }
        </div>
      </header>
      <section class="surface">
        <dl class="details-grid">
          <div>
            <dt>Existencia actual</dt>
            <dd class="stock-quantity">{{ row.existencia }} {{ row.unidad }}</dd>
          </div>
          <div>
            <dt>Stock mínimo</dt>
            <dd>{{ row.stock_minimo }} {{ row.unidad }}</dd>
          </div>
          <div>
            <dt>Costo unitario estimado (PEN)</dt>
            <dd>{{ cost(row.costo_unitario_estimado) }}</dd>
          </div>
          <div>
            <dt>Categoría</dt>
            <dd>{{ row.categoria_nombre || 'Sin categoría' }}</dd>
          </div>
        </dl>
        <p class="muted">
          Saldo del ledger, no editable directamente. No hay conversiones de unidades ni saldo por
          lote. Los proveedores se consultan en las compras enlazadas a los movimientos.
        </p>
      </section>
      @if (session.hasPermission('negocio.view_servicios')) {
        <section class="surface section-gap">
          <h2>Tratamientos que usan este artículo</h2>
          @if (facade.uses.error(); as error) {
            <bm-alert [message]="error" />
          }
          @if (facade.uses.loading()) {
            <bm-loading />
          } @else {
            <ul>
              @for (use of facade.uses.rows(); track use.servicio_id) {
                <li>
                  <a [routerLink]="['/admin/catalogo/servicios', use.servicio_id]">{{
                    use.servicio_nombre
                  }}</a>
                  · {{ use.cantidad_estimada }} {{ use.unidad }} estimados
                </li>
              } @empty {
                <li>No aparece en recetas de tratamientos.</li>
              }
            </ul>
          }
          <bm-pager
            [count]="facade.uses.count()"
            [page]="Number(facade.uses.query()['page'])"
            [busy]="facade.uses.loading()"
            (changed)="facade.uses.page($event)"
          />
        </section>
      }
      @if (session.hasPermission('negocio.view_movimientosinventario')) {
        <section class="surface section-gap">
          <h2>Historial de este artículo</h2>
          @if (facade.movements.error(); as error) {
            <bm-alert [message]="error" />
          }
          @if (facade.movements.loading()) {
            <bm-loading />
          } @else {
            <bm-movement-cards [rows]="facade.movements.rows()" />
          }
          <bm-pager
            [count]="facade.movements.count()"
            [page]="Number(facade.movements.query()['page'])"
            [busy]="facade.movements.loading()"
            (changed)="facade.movements.page($event)"
          />
        </section>
      }
    } `,
})
export class ArticleDetail {
  readonly facade = inject(InventoryFacade);
  readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);
  readonly id = Number(this.route.snapshot.paramMap.get('id'));
  readonly Number = Number;
  readonly status = stockStatus;
  readonly cost = unitCost;
  constructor() {
    void this.facade.article(this.id);
    if (this.session.hasPermission('negocio.view_servicios'))
      this.facade.uses.filter({ articulo: this.id });
    if (this.session.hasPermission('negocio.view_movimientosinventario'))
      this.facade.movements.filter({ articulo: this.id });
  }
  canAdjust() {
    return (
      this.session.hasPermission('negocio.add_movimientosinventario') &&
      this.session.hasPermission('negocio.view_movimientosinventario')
    );
  }
}
