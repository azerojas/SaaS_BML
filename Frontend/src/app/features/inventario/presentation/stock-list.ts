import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { SessionStore } from '../../../core/auth/application/session-store';
import { InventoryFacade } from '../application/inventory-facade';
import { OperationsNav } from '../../../shared/ui/operations-nav';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Pager } from '../../../shared/ui/pager';
import { StockRows, MovementCards } from './stock-ui';
import { ReferencePicker } from '../../catalogo/presentation/reference-picker';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { CatalogForm } from '../../catalogo/presentation/catalog-form';
import { CatalogApi } from '../../catalogo/infrastructure/catalog-api';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { RecordState } from '../../../shared/application/operation-state';
import { CatalogRecord } from '../../catalogo/domain/catalog';
import { StockItem } from '../domain/inventory';
@Component({
  selector: 'bm-stock-list',
  imports: [
    MatButtonModule,
    OperationsNav,
    Alert,
    Loading,
    Pager,
    StockRows,
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
      @if (actions.error(); as error) {
        <bm-alert [message]="error" />
      }
      <div class="filters">
        <div>
          <label for="stock-low">Situación de stock</label
          ><select id="stock-low" (change)="filter('bajo_minimo', $event)">
            <option value="all">Todos</option>
            <option value="true">Por reponer</option>
            <option value="false">Sobre el mínimo</option>
          </select>
        </div>
        @if (session.hasPermission('negocio.view_categoriasarticulo')) {
          <bm-reference-picker
            id="stock-category"
            label="Categoría de artículo"
            kind="categorias-articulo"
            [value]="String(state.query()['categoria'] ?? '')"
            (changed)="category($event)"
          />
        }
      </div>
      @if (state.error(); as error) {
        <bm-alert [message]="error" /><button mat-button (click)="state.reload()">
          Reintentar stock
        </button>
      }
      @if (state.loading()) {
        <bm-loading label="Consultando existencias…" />
      } @else {
        <bm-stock-rows
          [rows]="state.rows()"
          [canEdit]="session.hasPermission('negocio.change_articulos')"
          [busy]="actions.busy()"
          (edited)="edit($event)"
          (removed)="remove($event)"
        />
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
  private readonly dialog = inject(MatDialog);
  private readonly catalog = inject(CatalogApi);
  readonly actions = new RecordState<CatalogRecord>();
  readonly facade = inject(InventoryFacade);
  readonly state = this.facade.stock;
  readonly session = inject(SessionStore);
  readonly Number = Number;
  readonly String = String;
  constructor() {
    this.state.filter({ activo: 'true' });
    void this.facade.overview();
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
  async edit(row: StockItem) {
    if (!this.session.hasPermission('negocio.change_articulos')) return;
    const saved = await firstValueFrom(
      this.dialog
        .open(CatalogForm, {
          data: { kind: 'articulos', id: row.articulo_id },
          width: '800px',
          maxWidth: '96vw',
          disableClose: true,
          autoFocus: 'first-heading',
        })
        .afterClosed(),
    );
    if (saved) this.refresh();
  }
  async remove(row: StockItem) {
    if (!this.session.hasPermission('negocio.change_articulos') || this.actions.busy()) return;
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialog, {
          data: {
            title: '¿Eliminar artículo?',
            description:
              row.nombre +
              ' se retirará de los artículos activos. Se conservan sus compras y movimientos.',
            confirm: 'Eliminar',
          },
        })
        .afterClosed(),
    );
    if (
      confirmed &&
      (await this.actions.run(this.catalog.active('articulos', row.articulo_id, false)))
    )
      this.refresh();
  }
}
