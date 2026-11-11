import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SessionStore } from '../../../core/auth/application/session-store';
import { InventoryFacade } from '../application/inventory-facade';
import { OperationsNav } from '../../../shared/ui/operations-nav';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Pager } from '../../../shared/ui/pager';
import { StockCards } from './stock-ui';
@Component({
  selector: 'bm-stock-alerts',
  imports: [RouterLink, MatButtonModule, OperationsNav, Alert, Loading, Pager, StockCards],
  providers: [InventoryFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<bm-operations-nav />
    <header class="feature-heading">
      <div>
        <p class="eyebrow">ANTICÍPATE A LO QUE NECESITAS</p>
        <h1>Alertas de reposición</h1>
        <p>Artículos activos con existencia menor o igual al mínimo.</p>
      </div>
      @if (
        session.hasPermission('negocio.add_compras') &&
        session.hasPermission('negocio.view_compras')
      ) {
        <a mat-flat-button routerLink="/admin/compras/nueva">Preparar una compra</a>
      }
    </header>
    <section class="surface">
      <div class="filters">
        <div>
          <label for="alert-search">Buscar artículos por reponer</label
          ><input
            id="alert-search"
            type="search"
            maxlength="200"
            (input)="filter('search', $event)"
          />
        </div>
        <div>
          <label for="alert-type">Tipo de artículo</label
          ><select id="alert-type" (change)="filter('tipo_articulo', $event)">
            <option value="">Todos</option>
            <option value="INSUMO">Insumo</option>
            <option value="VENTA">Venta</option>
            <option value="AMBOS">Ambos</option>
          </select>
        </div>
      </div>
      @if (state.error(); as error) {
        <bm-alert [message]="error" /><button mat-button (click)="state.reload()">
          Reintentar alertas
        </button>
      }
      @if (state.loading()) {
        <bm-loading />
      } @else if (!state.rows().length && !state.error()) {
        <div class="empty-panel">
          <h2>Sin alertas de reposición para estos filtros</h2>
          <p>No hay artículos activos que requieran reposición en esta consulta.</p>
        </div>
      } @else {
        <bm-stock-cards [rows]="state.rows()" />
      }
      <bm-pager
        [count]="state.count()"
        [page]="Number(state.query()['page'])"
        [busy]="state.loading()"
        (changed)="state.page($event)"
      />
    </section>
    <p class="muted section-gap">
      No se muestran alertas de saldo por vencimiento: las fechas de compras no demuestran cuánto
      queda de cada lote.
    </p>`,
})
export class StockAlerts {
  readonly facade = inject(InventoryFacade);
  readonly state = this.facade.alerts;
  readonly session = inject(SessionStore);
  readonly Number = Number;
  constructor() {
    this.state.reload();
  }
  filter(key: string, event: Event) {
    const query = { ...this.state.query() };
    delete query[key];
    const value = (event.target as HTMLInputElement).value;
    if (value) query[key] = value;
    this.state.query.set(query);
    this.state.filter({});
  }
}
