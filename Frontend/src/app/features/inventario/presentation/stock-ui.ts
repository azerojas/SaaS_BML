import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Icon } from '../../../shared/ui/icon';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { RecordPreview, PreviewContent, PreviewField } from '../../../shared/ui/record-preview';
import { RouterLink } from '@angular/router';
import {
  Movement,
  StockItem,
  stockStatus,
  signedQuantity,
  movementSign,
  dateLima,
  unitCost,
} from '../domain/inventory';
@Component({
  selector: 'bm-stock-cards',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="stock-grid">
    @for (row of rows(); track row.articulo_id) {
      <a class="stock-card" [routerLink]="['/admin/inventario/articulos', row.articulo_id]"
        ><div class="stock-card-head">
          <span class="eyebrow">{{ row.tipo }}</span
          ><span class="badge" [class.inactive]="row.bajo_minimo">{{ status(row) }}</span>
        </div>
        <h2>{{ row.nombre }}</h2>
        <p class="muted">
          {{ row.sku || 'Sin SKU' }} · {{ row.categoria_nombre || 'Sin categoría' }}
        </p>
        <p class="stock-quantity">
          {{ row.existencia }} <span>{{ row.unidad }}</span>
        </p>
        <p class="muted">Mínimo {{ row.stock_minimo }} {{ row.unidad }}</p>
        <div class="stock-cost">
          <span>Costo unitario estimado</span
          ><strong>{{ cost(row.costo_unitario_estimado) }}</strong>
        </div></a
      >
    } @empty {
      <div class="empty-panel wide">
        <h2>Sin artículos para estos filtros</h2>
        <p>Revisa tu búsqueda o registra un artículo desde el catálogo.</p>
      </div>
    }
  </div>`,
})
export class StockCards {
  readonly rows = input.required<readonly StockItem[]>();
  readonly status = stockStatus;
  readonly cost = unitCost;
}
@Component({
  selector: 'bm-stock-rows',
  imports: [MatButtonModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (rows().length) {
      <div class="stock-list-head" aria-hidden="true">
        <span>Artículo</span><span>Existencia</span><span>Mínimo</span
        ><span>Costo unitario estimado</span><span>Estado</span><span>Acciones</span>
      </div>
      <ul class="stock-list" aria-label="Existencias">
        @for (row of rows(); track row.articulo_id) {
          <li>
            <div
              class="stock-list-row"
              [class.inventory-editable]="mode() === 'inventory' && canEdit()"
              [attr.data-article-id]="row.articulo_id"
            >
              <span class="stock-list-name">
                <strong>{{ row.nombre }}</strong>
                <span
                  >{{ row.sku || 'Sin SKU' }} · {{ row.tipo }} ·
                  {{ row.categoria_nombre || 'Sin categoría' }}</span
                >
              </span>
              <span class="stock-list-value"
                ><span class="stock-inline-label">Existencia</span
                ><strong
                  >{{ row.existencia }} <span>{{ row.unidad }}</span></strong
                ></span
              >
              <span class="stock-list-value"
                ><span class="stock-inline-label">Mínimo</span
                ><span>{{ row.stock_minimo }} {{ row.unidad }}</span></span
              >
              <span class="stock-list-value"
                ><span class="stock-inline-label">Costo unitario estimado</span
                ><span>{{ cost(row.costo_unitario_estimado) }}</span></span
              >
              <span class="stock-list-value"
                ><span class="stock-inline-label">Estado</span
                ><span class="badge" [class.inactive]="row.bajo_minimo">{{
                  status(row)
                }}</span></span
              >
              <span class="stock-row-actions">
                @if (mode() === 'inventory') {
                  @if (canEdit()) {
                    <button
                      mat-icon-button
                      type="button"
                      [disabled]="busy()"
                      [attr.aria-label]="'Editar artículo ' + row.nombre"
                      (click)="edited.emit(row)"
                    >
                      <bm-icon name="edit" />
                    </button>
                  }
                  @if (canEdit()) {
                    <button
                      mat-icon-button
                      type="button"
                      [disabled]="busy()"
                      [attr.aria-label]="'Eliminar artículo ' + row.nombre"
                      (click)="removed.emit(row)"
                    >
                      <bm-icon name="trash" />
                    </button>
                  }
                } @else {
                  <button
                    mat-icon-button
                    type="button"
                    [attr.aria-label]="'Visualizar artículo ' + row.nombre"
                    (click)="viewed.emit(row)"
                  >
                    <bm-icon name="eye" />
                  </button>
                  @if (canBuy()) {
                    <button
                      mat-stroked-button
                      type="button"
                      [disabled]="busy()"
                      (click)="purchased.emit(row)"
                    >
                      Comprar
                    </button>
                  }
                }
              </span>
            </div>
          </li>
        }
      </ul>
    } @else {
      <div class="empty-panel">
        <h2>Sin artículos para estos filtros</h2>
        <p>Revisa tu búsqueda o registra un artículo desde el catálogo.</p>
      </div>
    }`,
  styleUrl: './stock-rows.scss',
})
export class StockRows {
  readonly mode = input<'inventory' | 'replenishment'>('inventory');
  readonly canEdit = input(false);
  readonly canBuy = input(false);
  readonly busy = input(false);
  readonly edited = output<StockItem>();
  readonly removed = output<StockItem>();
  readonly viewed = output<StockItem>();
  readonly purchased = output<StockItem>();
  readonly rows = input.required<readonly StockItem[]>();
  readonly status = stockStatus;
  readonly cost = unitCost;
}
@Component({
  selector: 'bm-movement-cards',
  imports: [RouterLink, MatButtonModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="movement-list">
    @for (row of rows(); track row.id) {
      <article class="movement-row">
        <button
          class="movement-details"
          mat-icon-button
          type="button"
          [attr.aria-label]="'Visualizar movimiento ' + row.id"
          title="Visualizar movimiento"
          (click)="view(row)"
        >
          <bm-icon name="eye" />
        </button>
        <div>
          <span class="badge" [class.inactive]="row.cantidad_firmada.startsWith('-')">{{
            direction(row.cantidad_firmada)
          }}</span>
          <h3>
            <a [routerLink]="['/admin/inventario/articulos', row.articulo_id]">{{
              row.articulo_nombre
            }}</a>
          </h3>
          <p>{{ row.motivo }} · {{ date(row.fecha) }}</p>
        </div>
        <div>
          <strong>{{ quantity(row.cantidad_firmada) }} {{ row.unidad }}</strong>
          <p class="muted">
            {{
              row.valoracion === 'NO_VALORIZADO' ? 'Ajuste no valorizado' : cost(row.costo_unitario)
            }}
          </p>
        </div>
        <div class="movement-reference">
          @if (row.compra_id) {
            <a [routerLink]="['/admin/compras', row.compra_id]">Compra #{{ row.compra_id }}</a>
          } @else {
            <span>Movimiento #{{ row.id }}</span>
          }
          <p class="muted">
            {{
              row.registrado_por_id
                ? 'Operador #' + row.registrado_por_id
                : 'Operador no registrado'
            }}
          </p>
          @if (row.notas) {
            <p class="preserve-lines">{{ row.notas }}</p>
          }
        </div>
      </article>
    } @empty {
      <div class="empty-panel">
        <h2>No hay movimientos registrados para estos filtros</h2>
        <p>Las entradas y salidas aparecerán aquí al confirmarse en Django.</p>
      </div>
    }
  </div>`,
  styles: `
    .movement-row {
      position: relative;
      padding-right: 64px;
    }
    .movement-details {
      position: absolute;
      top: 12px;
      right: 12px;
    }
    .movement-details bm-icon {
      width: 18px;
      height: 18px;
    }
  `,
})
export class MovementCards {
  private readonly dialog = inject(MatDialog);
  readonly rows = input.required<readonly Movement[]>();
  readonly direction = movementSign;
  readonly quantity = signedQuantity;
  readonly date = dateLima;
  readonly cost = unitCost;
  view(row: Movement) {
    const fields: PreviewField[] = [
      { label: 'Artículo', value: row.articulo_nombre, icon: 'box' },
      { label: 'Fecha y hora · Lima', value: this.date(row.fecha), icon: 'calendar' },
      { label: 'Motivo', value: row.motivo.replaceAll('_', ' '), icon: 'receipt' },
      {
        label: 'Valoración',
        value:
          row.valoracion === 'NO_VALORIZADO'
            ? 'No valorizado'
            : row.valoracion.replaceAll('_', ' '),
        icon: 'chart',
      },
      {
        label: 'Registrado por',
        value: row.registrado_por_id ? 'Operador #' + row.registrado_por_id : 'No registrado',
        icon: 'users',
      },
      { label: 'Unidad de medida', value: row.unidad, icon: 'box' },
    ];
    for (const [label, id] of [
      ['Compra', row.compra_id],
      ['Detalle de compra', row.detalle_compra_id],
      ['Consumo de servicio', row.consumo_servicio_id],
      ['Detalle de venta', row.detalle_venta_id],
    ] as const) {
      if (id) fields.push({ label, value: '#' + id, icon: 'receipt' });
    }
    this.dialog.open(RecordPreview, {
      width: '760px',
      maxWidth: '96vw',
      autoFocus: 'first-heading',
      data: {
        title: 'Movimiento #' + row.id,
        subtitle: 'Detalle del movimiento',
        load: () =>
          of<PreviewContent>({
            kind: 'movement',
            status: {
              label: this.direction(row.cantidad_firmada),
              positive: this.direction(row.cantidad_firmada) === 'Entrada',
            },
            metrics: [
              {
                label: 'Cantidad',
                value: this.quantity(row.cantidad_firmada) + ' ' + row.unidad,
                icon: 'box',
              },
              {
                label: 'Costo unitario',
                value:
                  row.valoracion === 'NO_VALORIZADO'
                    ? 'No valorizado'
                    : this.cost(row.costo_unitario),
                icon: 'receipt',
              },
            ],
            fields,
            note: row.notas ?? undefined,
          }),
      },
    });
  }
}
