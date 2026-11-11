import { ChangeDetectionStrategy, Component, input } from '@angular/core';
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
  selector: 'bm-movement-cards',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="movement-list">
    @for (row of rows(); track row.id) {
      <article class="movement-row">
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
})
export class MovementCards {
  readonly rows = input.required<readonly Movement[]>();
  readonly direction = movementSign;
  readonly quantity = signedQuantity;
  readonly date = dateLima;
  readonly cost = unitCost;
}
