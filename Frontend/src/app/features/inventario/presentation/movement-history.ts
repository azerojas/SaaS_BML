import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { InventoryFacade } from '../application/inventory-facade';
import { MOVEMENT_REASONS } from '../domain/inventory';
import { OperationsNav } from '../../../shared/ui/operations-nav';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Pager } from '../../../shared/ui/pager';
import { MovementCards } from './stock-ui';
@Component({
  selector: 'bm-movement-history',
  imports: [MatButtonModule, OperationsNav, Alert, Loading, Pager, MovementCards],
  providers: [InventoryFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<bm-operations-nav />
    <header class="feature-heading">
      <div>
        <p class="eyebrow">CADA ENTRADA Y CADA SALIDA</p>
        <h1>Movimientos de inventario</h1>
        <p>Historial inmutable, ordenado por fecha e identificador.</p>
      </div>
    </header>
    <section class="surface">
      <div class="filters">
        <div>
          <label for="movement-search">Buscar movimientos por artículo</label
          ><input
            id="movement-search"
            type="search"
            maxlength="200"
            (input)="filter('search', $event)"
          />
        </div>
        <div>
          <label for="movement-reason">Motivo</label
          ><select id="movement-reason" (change)="filter('motivo', $event)">
            <option value="">Todos</option>
            @for (reason of reasons; track reason) {
              <option [value]="reason">{{ reason }}</option>
            }
          </select>
        </div>
        <div>
          <label for="movement-from">Desde</label
          ><input id="movement-from" type="date" (change)="filter('desde', $event)" />
        </div>
        <div>
          <label for="movement-until">Hasta</label
          ><input id="movement-until" type="date" (change)="filter('hasta', $event)" />
        </div>
      </div>
      @if (state.query()['articulo'] || state.query()['compra']) {
        <p class="muted">
          Filtro fijo:
          {{
            state.query()['articulo']
              ? 'artículo #' + state.query()['articulo']
              : 'compra #' + state.query()['compra']
          }}
        </p>
      }
      @if (state.error(); as error) {
        <bm-alert [message]="error" /><button mat-button (click)="state.reload()">
          Reintentar movimientos
        </button>
      }
      @if (state.loading()) {
        <bm-loading />
      } @else {
        <bm-movement-cards [rows]="state.rows()" />
      }
      <bm-pager
        [count]="state.count()"
        [page]="Number(state.query()['page'])"
        [busy]="state.loading()"
        (changed)="state.page($event)"
      />
    </section>
    <p class="muted section-gap">
      Las referencias de consumo o venta, si existen, solo se muestran como historial. Esta fase no
      registra esas operaciones ni permite modificar movimientos.
    </p>`,
})
export class MovementHistory {
  readonly facade = inject(InventoryFacade);
  readonly state = this.facade.movements;
  private readonly route = inject(ActivatedRoute);
  readonly reasons = MOVEMENT_REASONS;
  readonly Number = Number;
  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const query: Record<string, string> = {};
    for (const key of ['articulo', 'compra']) {
      const value = params.get(key);
      if (value && /^[1-9]\d*$/.test(value)) query[key] = value;
    }
    this.state.filter(query);
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
