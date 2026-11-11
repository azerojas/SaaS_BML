import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SessionStore } from '../../../core/auth/application/session-store';
import { InventoryFacade } from '../application/inventory-facade';
import { OperationsNav } from '../../../shared/ui/operations-nav';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Pager } from '../../../shared/ui/pager';
import { StockCards, MovementCards } from './stock-ui';
import { ReferencePicker } from '../../catalogo/presentation/reference-picker';
@Component({
  selector: 'bm-stock-list',
  imports: [
    RouterLink,
    MatButtonModule,
    OperationsNav,
    Alert,
    Loading,
    Pager,
    StockCards,
    MovementCards,
    ReferencePicker,
  ],
  providers: [InventoryFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<bm-operations-nav />
    <header class="feature-heading">
      <div>
        <p class="eyebrow">CUIDA LO QUE HACE POSIBLE TU TRABAJO</p>
        <h1>Inventario</h1>
        <p>Existencias oficiales de PostgreSQL, sin sumar unidades diferentes.</p>
      </div>
      <div class="form-actions">
        <button mat-stroked-button (click)="refresh()">Actualizar inventario</button>
        @if (canAdjust()) {
          <a mat-flat-button routerLink="ajustes/nuevo">Registrar ajuste</a>
        }
      </div>
    </header>
    @if (facade.summaryError(); as error) {
      <bm-alert [message]="error" />
    }
    @if (facade.summary(); as summary) {
      <section class="inventory-kpis" aria-label="Resumen global de artículos activos">
        <article>
          <span>Artículos activos</span><strong>{{ summary.articulos_activos }}</strong>
        </article>
        <article>
          <span>En reposición</span><strong>{{ summary.bajo_minimo }}</strong>
        </article>
        <article>
          <span>Existencia cero o negativa</span><strong>{{ summary.agotados }}</strong>
        </article>
        <article>
          <span>Sin movimientos</span><strong>{{ summary.sin_movimientos }}</strong>
        </article>
      </section>
    } @else if (!facade.summaryError()) {
      <bm-loading label="Consultando resumen…" />
    }
    <section class="surface">
      <div class="filters">
        <div>
          <label for="stock-search">Buscar existencias</label
          ><input
            id="stock-search"
            type="search"
            maxlength="200"
            placeholder="Nombre o unidad"
            (input)="filter('search', $event)"
          />
        </div>
        <div>
          <label for="stock-type">Tipo de artículo</label
          ><select id="stock-type" (change)="filter('tipo', $event)">
            <option value="">Todos</option>
            <option value="INSUMO">Insumo</option>
            <option value="VENTA">Venta</option>
            <option value="AMBOS">Ambos</option>
          </select>
        </div>
        <div>
          <label for="stock-active">Estado del artículo</label
          ><select id="stock-active" (change)="filter('activo', $event)">
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
            <option value="all">Todos</option>
          </select>
        </div>
        <div>
          <label for="stock-low">Situación de stock</label
          ><select id="stock-low" (change)="filter('bajo_minimo', $event)">
            <option value="all">Todos</option>
            <option value="true">Por reponer</option>
            <option value="false">Sobre el mínimo</option>
          </select>
        </div>
      </div>
      @if (session.hasPermission('negocio.view_categoriasarticulo')) {
        <details class="filter-extra">
          <summary>Filtrar por categoría</summary>
          <bm-reference-picker
            id="stock-category"
            label="Categoría de artículo"
            kind="categorias-articulo"
            [value]="String(state.query()['categoria'] ?? '')"
            (changed)="category($event)"
          />
        </details>
      }
      @if (state.error(); as error) {
        <bm-alert [message]="error" /><button mat-button (click)="state.reload()">
          Reintentar stock
        </button>
      }
      @if (state.loading()) {
        <bm-loading label="Consultando existencias…" />
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
    @if (facade.summary()?.ultimos_movimientos; as movements) {
      <section class="surface section-gap">
        <h2>Últimas entradas y salidas</h2>
        <bm-movement-cards [rows]="movements" />
      </section>
    }
    <p class="muted section-gap">
      El costo es un promedio histórico de compras recibidas; no es precio de venta ni valoración
      FIFO. Los ajustes no se valorizan.
    </p>`,
})
export class StockList {
  readonly facade = inject(InventoryFacade);
  readonly state = this.facade.stock;
  readonly session = inject(SessionStore);
  readonly Number = Number;
  readonly String = String;
  constructor() {
    this.state.filter({ activo: 'true' });
    void this.facade.overview();
  }
  canAdjust() {
    return (
      this.session.hasPermission('negocio.add_movimientosinventario') &&
      this.session.hasPermission('negocio.view_movimientosinventario')
    );
  }
  filter(key: string, event: Event) {
    this.setFilter(key, (event.target as HTMLInputElement).value);
  }
  category(value: string) {
    this.setFilter('categoria', value);
  }
  private setFilter(key: string, value: string) {
    const query = { ...this.state.query() };
    delete query[key];
    if (value) query[key] = value;
    this.state.query.set(query);
    this.state.filter({});
  }
  refresh() {
    this.state.reload();
    void this.facade.overview();
  }
}
