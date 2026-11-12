import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { ArrivalsFacade } from '../application/arrivals-facade';
import { FinanceNav } from '../../ventas/presentation/finance-nav';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Pager } from '../../../shared/ui/pager';
import { dateLima } from '../../inventario/domain/inventory';
@Component({
  selector: 'bm-arrival-inbox',
  imports: [RouterLink, ReactiveFormsModule, MatButtonModule, FinanceNav, Alert, Loading, Pager],
  providers: [ArrivalsFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<bm-finance-nav />
    <header class="feature-heading">
      <div>
        <p class="eyebrow">RECEPCIÓN PRIVADA</p>
        <h1>Llegadas</h1>
        <p>Comprueba la identidad en persona antes de confirmar.</p>
      </div>
      <button mat-stroked-button (click)="facade.list.reload()" [disabled]="facade.list.loading()">
        Actualizar llegadas
      </button>
    </header>
    <form class="surface filter-grid" [formGroup]="form" (ngSubmit)="filter()">
      <label>Buscar nombre o teléfono<input formControlName="search" /></label>
      <label
        >Estado de llegada<select formControlName="estado">
          <option value="PENDIENTE">Pendiente</option>
          <option value="CONFIRMADA">Confirmada</option>
          <option value="RECHAZADA">Rechazada</option>
          <option value="CANCELADA">Cancelada</option>
          <option value="">Todos</option>
        </select></label
      >
      <label
        >Vigencia<select formControlName="vigentes">
          <option value="all">Todas</option>
          <option value="true">Vigentes</option>
          <option value="false">Vencidas</option>
        </select></label
      >
      <label>Desde<input formControlName="desde" type="date" /></label
      ><label>Hasta<input formControlName="hasta" type="date" /></label>
      <button mat-flat-button type="submit">Aplicar filtros</button>
    </form>
    @if (facade.list.error(); as error) {
      <bm-alert [message]="error" />
    }
    @if (facade.list.loading()) {
      <bm-loading />
    } @else {
      <div class="record-list section-gap">
        @for (row of facade.list.rows(); track row.id) {
          <article class="record-row">
            <div>
              <h2>
                <a [routerLink]="['/admin/llegadas', row.id]"
                  >{{ row.nombres }} {{ row.apellidos }}</a
                >
              </h2>
              <p>{{ row.telefono }} · {{ date(row.solicitada_en) }}</p>
              <p>
                {{ row.punto_nombre || 'Recepción manual' }} ·
                {{ row.alta_provisional ? 'Alta por verificar' : 'Ficha existente' }}
              </p>
            </div>
            <span class="badge">{{ row.vencida ? 'Pendiente vencida' : row.estado }}</span>
          </article>
        } @empty {
          <p class="empty-panel">No hay llegadas para estos filtros.</p>
        }
      </div>
    }
    <bm-pager
      [count]="facade.list.count()"
      [page]="Number(facade.list.query()['page'])"
      [busy]="facade.list.loading()"
      (changed)="facade.list.page($event)"
    />`,
})
export class ArrivalInbox {
  readonly facade = inject(ArrivalsFacade);
  readonly date = dateLima;
  readonly Number = Number;
  readonly form = inject(FormBuilder).nonNullable.group({
    search: '',
    estado: 'PENDIENTE',
    vigentes: 'all',
    desde: '',
    hasta: '',
  });
  filter() {
    this.facade.list.query.set({
      page: 1,
      page_size: 20,
      ...Object.fromEntries(
        Object.entries(this.form.getRawValue()).filter(([, value]) => value !== ''),
      ),
    });
    this.facade.list.reload();
  }
}
