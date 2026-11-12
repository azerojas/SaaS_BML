import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { VisitsFacade } from '../application/visits-facade';
import { SessionStore } from '../../../core/auth/application/session-store';
import { FinanceNav } from '../../ventas/presentation/finance-nav';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Pager } from '../../../shared/ui/pager';
import { dateLima } from '../../inventario/domain/inventory';
@Component({
  selector: 'bm-visits-list',
  imports: [RouterLink, ReactiveFormsModule, MatButtonModule, FinanceNav, Alert, Loading, Pager],
  providers: [VisitsFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<bm-finance-nav />
    <header class="feature-heading">
      <div>
        <p class="eyebrow">ATENCIÓN</p>
        <h1>Visitas</h1>
        <p>Tratamientos, productos y cobros de cada atención.</p>
      </div>
      @if (session.hasPermission('finanzas.manage_visits')) {
        <a mat-flat-button routerLink="/admin/visitas/nueva">Abrir visita manual</a>
      }
    </header>
    <form class="surface filter-grid" [formGroup]="form" (ngSubmit)="filter()">
      <label
        >Estado de visita<select formControlName="estado">
          <option value="">Todas</option>
          <option value="ABIERTA">Abierta</option>
          <option value="FINALIZADA">Finalizada</option>
          <option value="CANCELADA">Cancelada</option>
        </select></label
      ><label>Desde<input type="date" formControlName="desde" /></label
      ><label>Hasta<input type="date" formControlName="hasta" /></label
      ><button mat-stroked-button type="submit">Filtrar visitas</button
      ><button mat-button type="button" (click)="facade.list.reload()">Actualizar</button>
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
                <a [routerLink]="['/admin/visitas', row.id]">Visita #{{ row.id }}</a>
              </h2>
              <p>Ficha #{{ row.clienta_id }} · {{ date(row.inicio_en) }}</p>
            </div>
            <span class="badge">{{ row.estado }}</span>
          </article>
        } @empty {
          <p class="empty-panel">No hay visitas para estos filtros.</p>
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
export class VisitsList {
  readonly facade = inject(VisitsFacade);
  readonly session = inject(SessionStore);
  readonly date = dateLima;
  readonly Number = Number;
  readonly form = inject(FormBuilder).nonNullable.group({ estado: '', desde: '', hasta: '' });
  constructor() {
    this.facade.list.reload();
  }
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
