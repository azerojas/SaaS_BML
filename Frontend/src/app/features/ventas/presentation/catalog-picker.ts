import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { LookupsFacade } from '../application/lookups-facade';
import { CatalogRecord } from '../../catalogo/domain/catalog';
import { Alert } from '../../../shared/ui/alert';
import { Pager } from '../../../shared/ui/pager';
import { Loading } from '../../../shared/ui/loading';
@Component({
  selector: 'bm-catalog-picker',
  imports: [ReactiveFormsModule, MatButtonModule, Alert, Pager, Loading],
  providers: [LookupsFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="surface phase4-form">
    <h3>{{ label() }}</h3>
    <form [formGroup]="form" class="filter-grid" (ngSubmit)="search()">
      <label>Buscar por nombre o SKU<input formControlName="search" /></label
      ><button mat-stroked-button type="submit" [disabled]="disabled()">
        Buscar {{ label() }}
      </button>
    </form>
    @if (list().error(); as error) {
      <bm-alert [message]="error" />
    }
    @if (list().loading()) {
      <bm-loading />
    }
    <div class="lookup-results">
      @for (item of list().rows(); track item.id) {
        @if (
          kind() === 'servicios' ||
          mode() === 'all' ||
          (mode() === 'sale' ? item['tipo'] !== 'INSUMO' : item['tipo'] !== 'VENTA')
        ) {
          <button
            mat-stroked-button
            type="button"
            [disabled]="disabled()"
            (click)="picked.emit(item)"
          >
            {{ item.nombre
            }}{{ kind() === 'articulos' ? ' · ' + item['unidad'] : ' · S/ ' + item['precio_base'] }}
          </button>
        }
      } @empty {
        <p class="muted">Busca y selecciona un registro del catálogo.</p>
      }
    </div>
    <bm-pager
      [count]="list().count()"
      [page]="Number(list().query()['page'])"
      [busy]="list().loading()"
      (changed)="list().page($event)"
    />
  </div>`,
})
export class CatalogPicker {
  private readonly facade = inject(LookupsFacade);
  readonly kind = input<'servicios' | 'articulos'>('servicios');
  readonly mode = input<'sale' | 'consumption' | 'all'>('sale');
  readonly label = input('Catálogo');
  readonly disabled = input(false);
  readonly picked = output<CatalogRecord>();
  readonly Number = Number;
  readonly form = inject(FormBuilder).nonNullable.group({ search: '' });
  list() {
    return this.kind() === 'servicios' ? this.facade.services : this.facade.articles;
  }
  search() {
    this.list().filter({ search: this.form.controls.search.value });
  }
}
