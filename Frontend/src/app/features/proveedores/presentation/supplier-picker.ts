import { ChangeDetectionStrategy, Component, inject, input, OnInit, output } from '@angular/core';
import { SuppliersFacade } from '../application/suppliers-facade';
import { Pager } from '../../../shared/ui/pager';
import { Alert } from '../../../shared/ui/alert';
import { FormsModule } from '@angular/forms';
@Component({
  selector: 'bm-supplier-picker',
  imports: [Pager, Alert, FormsModule],
  providers: [SuppliersFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="reference-picker">
    <label for="purchase-supplier">Proveedor</label
    ><select
      id="purchase-supplier"
      [ngModel]="value()"
      [ngModelOptions]="{ standalone: true }"
      (ngModelChange)="changed.emit($event)"
    >
      <option value="">{{ emptyLabel() }}</option>
      @if (value()) {
        <option [value]="value()">
          {{ selectionLabel() }}
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
    @if (state.count() > 20) {
      <bm-pager
        [count]="state.count()"
        [page]="Number(state.query()['page'])"
        [busy]="state.loading()"
        (changed)="state.page($event)"
      />
    }
  </div>`,
})
export class SupplierPicker implements OnInit {
  readonly facade = inject(SuppliersFacade);
  readonly state = this.facade.list;
  readonly value = input('');
  readonly currentLabel = input('');
  readonly emptyLabel = input('Sin proveedor');
  readonly changed = output<string>();
  readonly Number = Number;
  readonly String = String;
  ngOnInit() {
    this.state.filter({ activo: 'true' });
  }
  selectionLabel() {
    const row = this.state.rows().find((item) => String(item.id) === this.value());
    return row
      ? row.nombre + (row.ruc ? ' · ' + row.ruc : '')
      : this.currentLabel() || 'Proveedor seleccionado (#' + this.value() + ')';
  }
}
