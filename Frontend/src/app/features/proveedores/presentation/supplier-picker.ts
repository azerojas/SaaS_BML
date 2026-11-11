import { ChangeDetectionStrategy, Component, inject, input, OnInit, output } from '@angular/core';
import { SuppliersFacade } from '../application/suppliers-facade';
import { Pager } from '../../../shared/ui/pager';
import { Alert } from '../../../shared/ui/alert';
@Component({
  selector: 'bm-supplier-picker',
  imports: [Pager, Alert],
  providers: [SuppliersFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="reference-picker">
    <label for="purchase-supplier-search">Buscar proveedor activo</label
    ><input
      id="purchase-supplier-search"
      type="search"
      maxlength="200"
      (input)="search($event)"
    /><label for="purchase-supplier">Proveedor</label
    ><select id="purchase-supplier" [value]="value()" (change)="choose($event)">
      <option value="">Sin proveedor</option>
      @if (value()) {
        <option [value]="value()">
          {{ currentLabel() || 'Proveedor seleccionado (#' + value() + ')' }}
        </option>
      }
      @for (row of state.rows(); track row.id) {
        @if (String(row.id) !== value()) {
          <option [value]="row.id">{{ row.nombre }}{{ row.ruc ? ' · ' + row.ruc : '' }}</option>
        }
      }
    </select>
    @if (state.error(); as error) {
      <bm-alert [message]="error" /><button type="button" (click)="state.reload()">
        Reintentar opciones
      </button>
    }
    <bm-pager
      [count]="state.count()"
      [page]="Number(state.query()['page'])"
      [busy]="state.loading()"
      (changed)="state.page($event)"
    />
  </div>`,
})
export class SupplierPicker implements OnInit {
  readonly facade = inject(SuppliersFacade);
  readonly state = this.facade.list;
  readonly value = input('');
  readonly currentLabel = input('');
  readonly changed = output<string>();
  readonly Number = Number;
  readonly String = String;
  ngOnInit() {
    this.state.filter({ activo: 'true' });
  }
  search(event: Event) {
    this.state.filter({ search: (event.target as HTMLInputElement).value });
  }
  choose(event: Event) {
    this.changed.emit((event.target as HTMLSelectElement).value);
  }
}
