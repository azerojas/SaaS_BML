import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SessionStore } from '../../../core/auth/application/session-store';
import { PurchasesFacade } from '../application/purchases-facade';
import { OperationsNav } from '../../../shared/ui/operations-nav';
import { SupplierPicker } from '../../proveedores/presentation/supplier-picker';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Pager } from '../../../shared/ui/pager';
import { pen } from '../../../shared/domain/records';
import { dateLima } from '../../inventario/domain/inventory';
@Component({
  selector: 'bm-purchases-list',
  imports: [RouterLink, MatButtonModule, OperationsNav, SupplierPicker, Alert, Loading, Pager],
  providers: [PurchasesFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<bm-operations-nav />
    <header class="feature-heading">
      <div>
        <p class="eyebrow">LO QUE NECESITAS PARA SEGUIR CREANDO</p>
        <h1>Compras</h1>
        <p>Borradores, recepción completa y existencias trazadas por movimientos.</p>
      </div>
      @if (session.hasPermission('negocio.add_compras')) {
        <a mat-flat-button routerLink="nueva">Nueva compra</a>
      }
    </header>
    <section class="surface">
      <div class="filters">
        <div>
          <label for="purchase-search">Buscar por documento</label
          ><input
            id="purchase-search"
            type="search"
            maxlength="200"
            (input)="filter('search', $event)"
          />
        </div>
        <div>
          <label for="purchase-state">Estado de compra</label
          ><select id="purchase-state" (change)="filter('estado', $event)">
            <option value="">Todos</option>
            <option value="BORRADOR">Borrador</option>
            <option value="RECIBIDA">Recibida</option>
            <option value="ANULADA">Anulada</option>
          </select>
        </div>
        <div>
          <label for="purchase-from">Compras desde</label
          ><input id="purchase-from" type="date" (change)="filter('desde', $event)" />
        </div>
        <div>
          <label for="purchase-until">Compras hasta</label
          ><input id="purchase-until" type="date" (change)="filter('hasta', $event)" />
        </div>
      </div>
      @if (session.hasPermission('negocio.view_proveedores')) {
        <details class="filter-extra">
          <summary>Filtrar por proveedor</summary>
          <bm-supplier-picker
            [value]="String(state.query()['proveedor'] ?? '')"
            (changed)="set('proveedor', $event)"
          />
        </details>
      }
      @if (state.error(); as error) {
        <bm-alert [message]="error" /><button mat-button (click)="state.reload()">
          Reintentar compras
        </button>
      }
      @if (state.loading()) {
        <bm-loading />
      } @else {
        <div class="record-list">
          @for (row of state.rows(); track row.id) {
            <a class="record-row purchase-row" [routerLink]="[row.id]"
              ><span class="record-main"
                ><strong>{{ row.numero_documento || 'Compra #' + row.id }}</strong
                ><span
                  >{{ row.proveedor_nombre || 'Sin proveedor' }} · {{ date(row.fecha) }}</span
                ></span
              ><span class="badge" [class.inactive]="row.estado === 'ANULADA'">{{
                row.estado
              }}</span
              ><strong>{{ money(row.total) }}</strong
              ><span aria-hidden="true">→</span></a
            >
          } @empty {
            <div class="empty-panel">
              <h2>No hay compras para estos filtros</h2>
              <p>Las compras que registres se mostrarán aquí.</p>
            </div>
          }
        </div>
      }
      <bm-pager
        [count]="state.count()"
        [page]="Number(state.query()['page'])"
        [busy]="state.loading()"
        (changed)="state.page($event)"
      />
    </section>`,
})
export class PurchasesList {
  readonly facade = inject(PurchasesFacade);
  readonly state = this.facade.list;
  readonly session = inject(SessionStore);
  readonly Number = Number;
  readonly String = String;
  readonly money = pen;
  readonly date = dateLima;
  constructor() {
    this.state.reload();
  }
  filter(key: string, event: Event) {
    this.set(key, (event.target as HTMLInputElement).value);
  }
  set(key: string, value: string) {
    const query = { ...this.state.query() };
    delete query[key];
    if (value) query[key] = value;
    this.state.query.set(query);
    this.state.filter({});
  }
}
