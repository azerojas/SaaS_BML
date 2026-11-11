import { ChangeDetectionStrategy, Component, inject, input, OnInit, output } from '@angular/core';
import { CatalogFacade } from '../application/catalog-facade';
import { CatalogRecord, Kind } from '../domain/catalog';
import { Pager } from '../../../shared/ui/pager';
import { Alert } from '../../../shared/ui/alert';
@Component({
  selector: 'bm-reference-picker',
  host: { '[attr.id]': 'null' },
  imports: [Pager, Alert],
  providers: [CatalogFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="reference-picker">
    <label [for]="id() + '-search'">Buscar {{ label() }}</label
    ><input
      [id]="id() + '-search'"
      type="search"
      maxlength="200"
      placeholder="Escribe para buscar opciones"
      (input)="search($event)"
    />
    <label [for]="id()">{{ label() }}{{ required() ? ' *' : '' }}</label
    ><select
      [id]="id()"
      [value]="value()"
      [attr.aria-required]="required()"
      (change)="choose($event)"
    >
      <option value="">Sin selección</option>
      @if (value()) {
        <option [value]="value()">
          {{ currentLabel() || 'Selección actual (#' + value() + ')' }}
        </option>
      }
      @for (row of facade.list.rows(); track row.id) {
        @if (String(row.id) !== value()) {
          <option
            [value]="String(row.id)"
            [disabled]="materialsOnly() && (row['tipo'] === 'VENTA' || row['activo'] === false)"
          >
            {{ row.nombre
            }}{{
              row['unidad_codigo']
                ? ' · ' + row['unidad_codigo']
                : row['codigo']
                  ? ' · ' + row['codigo']
                  : ''
            }}
          </option>
        }
      }
    </select>
    @if (facade.list.loading()) {
      <small role="status">Cargando opciones…</small>
    }
    @if (facade.list.error(); as error) {
      <bm-alert [message]="error" /><button type="button" (click)="facade.list.reload()">
        Reintentar opciones
      </button>
    }
    <bm-pager
      [count]="facade.list.count()"
      [page]="page()"
      [size]="20"
      [busy]="facade.list.loading()"
      (changed)="facade.list.page($event)"
    />
  </div>`,
})
export class ReferencePicker implements OnInit {
  readonly facade = inject(CatalogFacade);
  readonly kind = input.required<Kind>();
  readonly label = input.required<string>();
  readonly id = input.required<string>();
  readonly required = input(false);
  readonly value = input('');
  readonly currentLabel = input('');
  readonly materialsOnly = input(false);
  readonly activeOnly = input(false);
  readonly selected = output<CatalogRecord | null>();
  readonly changed = output<string>();
  readonly String = String;
  ngOnInit() {
    this.facade.configure(this.kind(), true);
    if (this.materialsOnly() || this.activeOnly()) this.facade.list.filter({ activo: 'true' });
  }
  search(event: Event) {
    this.facade.list.filter({ search: (event.target as HTMLInputElement).value });
  }
  choose(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.changed.emit(value);
    this.selected.emit(this.facade.list.rows().find((row) => String(row.id) === value) ?? null);
  }
  page() {
    return Number(this.facade.list.query()['page']);
  }
}
