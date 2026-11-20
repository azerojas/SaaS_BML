import { DateField } from '../../../shared/ui/date-field';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom, forkJoin, map } from 'rxjs';
import { PurchaseDetail } from './purchase-detail';
import { StockItem, unitCost } from '../../inventario/domain/inventory';
import { InventoryApi } from '../../inventario/infrastructure/inventory-api';
import { CatalogApi } from '../../catalogo/infrastructure/catalog-api';
import { RecordPreview } from '../../../shared/ui/record-preview';
import { Icon } from '../../../shared/ui/icon';
import { PurchaseForm } from './purchase-form';
import { Purchase } from '../domain/purchase';
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
import { StockRows } from '../../inventario/presentation/stock-ui';
@Component({
  selector: 'bm-purchases-list',
  imports: [
    Icon,
    StockRows,
    DateField,
    MatButtonModule,
    OperationsNav,
    SupplierPicker,
    Alert,
    Loading,
    Pager,
  ],
  providers: [PurchasesFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<bm-operations-nav />
    <header class="feature-heading">
      <div>
        <p class="eyebrow">LO QUE NECESITAS PARA SEGUIR CREANDO</p>
        <h1>Compras</h1>
        <p>Borradores, recepción completa y existencias trazadas por movimientos.</p>
      </div>
      @if (canCreate()) {
        <button
          mat-flat-button
          class="purchase-trigger"
          type="button"
          [disabled]="purchaseOpen()"
          (click)="purchase()"
        >
          <span class="purchase-trigger-content"><bm-icon name="plus" /><span>Compra</span></span>
        </button>
      }
    </header>
    <section class="surface" aria-label="Compras registradas">
      @if (purchaseSuccess()) {
        <bm-alert kind="info" [message]="purchaseSuccess()!" />
      }
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
          ><bm-date-field
            ariaLabel="Compras desde"
            inputId="purchase-from"
            (valueChanged)="filter('desde', $event)"
          />
        </div>
        <div>
          <label for="purchase-until">Compras hasta</label
          ><bm-date-field
            ariaLabel="Compras hasta"
            inputId="purchase-until"
            (valueChanged)="filter('hasta', $event)"
          />
        </div>
        @if (session.hasPermission('negocio.view_proveedores')) {
          <bm-supplier-picker
            emptyLabel="Todos los proveedores"
            [value]="String(state.query()['proveedor'] ?? '')"
            (changed)="set('proveedor', $event)"
          />
        }
      </div>
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
            <article class="record-row purchase-row">
              <span class="record-main"
                ><strong>{{ row.numero_documento || 'Compra #' + row.id }}</strong
                ><span
                  >{{ row.proveedor_nombre || 'Sin proveedor' }} · {{ date(row.fecha) }}</span
                ></span
              ><span class="badge" [class.inactive]="row.estado === 'ANULADA'">{{
                row.estado
              }}</span
              ><strong>{{ money(row.total) }}</strong
              ><button
                mat-icon-button
                type="button"
                [attr.aria-label]="'Visualizar compra ' + row.id"
                (click)="viewPurchase(row)"
              >
                <bm-icon name="eye" />
              </button>
            </article>
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
    </section>
    @if (session.hasPermission('negocio.view_articulos')) {
      <section class="surface section-gap" aria-labelledby="replenishment-title" id="reposicion">
        <h2 id="replenishment-title">Reposición</h2>
        <p class="muted">Productos e insumos agotados, con existencia de cero o menos.</p>
        @if (facade.depleted.error(); as error) {
          <bm-alert [message]="error" /><button
            mat-button
            type="button"
            (click)="facade.depleted.reload()"
          >
            Reintentar reposición
          </button>
        }
        @if (facade.depleted.loading()) {
          <bm-loading label="Consultando productos agotados…" />
        } @else if (facade.depleted.rows().length) {
          <bm-stock-rows
            [rows]="facade.depleted.rows()"
            mode="replenishment"
            [canBuy]="canCreate()"
            [busy]="purchaseOpen()"
            (viewed)="viewArticle($event)"
            (purchased)="purchase($event)"
          />
        } @else if (!facade.depleted.error()) {
          <div class="empty-panel">
            <h3>No hay productos agotados</h3>
            <p>Los artículos que se queden sin existencias aparecerán aquí.</p>
          </div>
        }
        <bm-pager
          [count]="facade.depleted.count()"
          [page]="Number(facade.depleted.query()['page'])"
          [busy]="facade.depleted.loading()"
          (changed)="facade.depleted.page($event)"
        />
      </section>
    }`,
  styles: `
    .purchase-trigger {
      min-height: 44px;
      padding-inline: 24px;
    }
    .purchase-trigger-content {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      line-height: 1;
      vertical-align: middle;
    }
    .purchase-trigger-content bm-icon {
      width: 20px;
      height: 20px;
    }
  `,
})
export class PurchasesList {
  private readonly inventory = inject(InventoryApi);
  private readonly catalog = inject(CatalogApi);
  private readonly dialog = inject(MatDialog);
  readonly purchaseOpen = signal(false);
  readonly purchaseSuccess = signal<string | null>(null);
  readonly facade = inject(PurchasesFacade);
  readonly state = this.facade.list;
  readonly session = inject(SessionStore);
  readonly Number = Number;
  readonly String = String;
  readonly money = pen;
  readonly date = dateLima;
  constructor() {
    this.state.reload();
    if (this.session.hasPermission('negocio.view_articulos')) this.facade.depleted.reload();
  }
  canCreate() {
    return (
      this.session.hasPermission('negocio.add_compras') &&
      this.session.hasPermission('negocio.view_articulos')
    );
  }
  async purchase(article?: StockItem) {
    if (this.purchaseOpen() || !this.canCreate()) return;
    this.purchaseOpen.set(true);
    try {
      const saved = await firstValueFrom(
        this.dialog
          .open<PurchaseForm, unknown, Purchase>(PurchaseForm, {
            data: { article },
            width: '1000px',
            maxWidth: '96vw',
            maxHeight: '92dvh',
            disableClose: true,
            autoFocus: 'first-heading',
            panelClass: 'purchase-editor-dialog',
          })
          .afterClosed(),
      );
      if (saved) {
        this.purchaseSuccess.set('Compra #' + saved.id + ' guardada.');
        this.state.reload();
      }
    } finally {
      this.purchaseOpen.set(false);
    }
  }
  async viewPurchase(row: Purchase) {
    await firstValueFrom(
      this.dialog
        .open(PurchaseDetail, {
          data: { id: row.id },
          width: '900px',
          maxWidth: '96vw',
          autoFocus: 'first-heading',
          ariaLabel: 'Detalle de compra',
          closePredicate: (_r, _c, instance) =>
            !(
              instance instanceof PurchaseDetail &&
              (instance.facade.busy() || instance.confirming())
            ),
        })
        .afterClosed(),
    );
    this.state.reload();
    this.facade.depleted.reload();
  }
  viewArticle(row: StockItem) {
    this.dialog.open(RecordPreview, {
      width: '760px',
      maxWidth: '96vw',
      data: {
        title: row.nombre,
        subtitle: 'Detalle de reposición',
        action: this.canCreate()
          ? {
              label: 'Comprar',
              run: () => {
                void this.purchase(row);
              },
            }
          : undefined,
        load: () =>
          forkJoin({
            stock: this.inventory.stock({ articulo: row.articulo_id }),
            article: this.catalog.get('articulos', row.articulo_id),
          }).pipe(
            map(({ stock, article }) => {
              const item = stock.results[0] ?? row;
              return {
                kind: 'stock',
                status: {
                  label:
                    Number(item.existencia) <= 0
                      ? 'Agotado'
                      : item.bajo_minimo
                        ? 'Por reponer'
                        : 'Disponible',
                  positive: !item.bajo_minimo && Number(item.existencia) > 0,
                },
                metrics: [
                  {
                    label: 'Existencia actual',
                    value: item.existencia + ' ' + item.unidad,
                    icon: 'box',
                  },
                  { label: 'Mínimo', value: item.stock_minimo + ' ' + item.unidad, icon: 'chart' },
                  {
                    label: 'Costo unitario estimado',
                    value: unitCost(item.costo_unitario_estimado),
                    icon: 'receipt',
                  },
                ],
                stock: {
                  current: Number(item.existencia),
                  minimum: Number(item.stock_minimo),
                  unit: item.unidad,
                },
                fields: [
                  { label: 'SKU', value: item.sku ?? 'Sin SKU', icon: 'receipt' },
                  {
                    label: 'Categoría',
                    value: item.categoria_nombre ?? 'Sin categoría',
                    icon: 'box',
                  },
                  {
                    label: 'Tipo',
                    value:
                      item.tipo === 'VENTA'
                        ? 'Producto de venta'
                        : item.tipo === 'AMBOS'
                          ? 'Producto e insumo'
                          : 'Insumo',
                    icon: 'sparkles',
                  },
                  { label: 'Precio de venta', value: pen(String(article['precio_venta'])) },
                ],
                note: String(article['descripcion'] ?? ''),
              };
            }),
          ),
      },
    });
  }
  filter(key: string, event: Event | string) {
    this.set(key, typeof event === 'string' ? event : (event.target as HTMLInputElement).value);
  }
  set(key: string, value: string) {
    const query = { ...this.state.query() };
    delete query[key];
    if (value) query[key] = value;
    this.state.query.set(query);
    this.state.filter({});
  }
}
