import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { CatalogApi } from '../../catalogo/infrastructure/catalog-api';
import { CatalogRecord } from '../../catalogo/domain/catalog';
import { PagedState } from '../../../shared/application/paged-state';
import { SessionStore } from '../../../core/auth/application/session-store';
import { Alert } from '../../../shared/ui/alert';
import { Pager } from '../../../shared/ui/pager';
@Component({
  selector: 'bm-agenda-services',
  imports: [ReactiveFormsModule, Alert, Pager],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="surface">
    <h2>Servicios del catálogo</h2>
    @if (session.hasPermission('negocio.view_servicios')) {
      <form [formGroup]="form" (ngSubmit)="rows.filter({ search: form.controls.search.value })">
        <label>Buscar servicio<input formControlName="search" /></label
        ><button type="submit" [disabled]="disabled()">Buscar servicios</button>
      </form>
      @if (rows.loading()) {
        <p role="status">Cargando servicios…</p>
      }
      @if (rows.error(); as error) {
        <bm-alert [message]="error" /><button type="button" (click)="rows.reload()">
          Reintentar
        </button>
      }
      <div class="agenda-options">
        @for (row of rows.rows(); track row.id) {
          <button type="button" [disabled]="disabled()" (click)="picked.emit(row)">
            {{ row.nombre }} · #{{ row.id }}
          </button>
        }
      </div>
      <bm-pager
        [count]="rows.count()"
        [page]="Number(rows.query()['page'])"
        [busy]="rows.loading()"
        (changed)="rows.page($event)"
      />
    } @else {
      <bm-alert
        message="Se necesita permiso de lectura del catálogo para seleccionar servicios reales."
      />
    }
  </section>`,
})
export class ServicePicker {
  readonly session = inject(SessionStore);
  private readonly api = inject(CatalogApi);
  readonly rows = new PagedState(
    (q) => this.api.list('servicios', { ...q, activo: 'true' }),
    false,
  );
  readonly form = inject(FormBuilder).nonNullable.group({ search: '' });
  readonly disabled = input(false);
  readonly picked = output<CatalogRecord>();
  readonly Number = Number;
  constructor() {
    if (this.session.hasPermission('negocio.view_servicios')) this.rows.filter({});
  }
}
