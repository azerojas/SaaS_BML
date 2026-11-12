import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SalesFacade } from '../application/sales-facade';
import { SessionStore } from '../../../core/auth/application/session-store';
import { FinanceNav } from './finance-nav';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Pager } from '../../../shared/ui/pager';
import { pen } from '../../../shared/domain/records';
import { dateLima } from '../../inventario/domain/inventory';
@Component({
  selector: 'bm-sales-list',
  imports: [RouterLink, ReactiveFormsModule, MatButtonModule, FinanceNav, Alert, Loading, Pager],
  providers: [SalesFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<bm-finance-nav />
    <header class="feature-heading">
      <div>
        <p class="eyebrow">ATENCIÓN Y CAJA</p>
        <h1>Ventas y pagos</h1>
        <p>Confirmar una venta y registrar su cobro son pasos separados.</p>
      </div>
      @if (session.hasPermission('finanzas.manage_sales')) {
        <a mat-flat-button routerLink="/admin/ventas/nueva">Venta de mostrador</a>
      }
    </header>
    <form class="surface filter-grid" [formGroup]="form" (ngSubmit)="filter()">
      <label
        >Estado de venta<select formControlName="estado">
          <option value="">Todas</option>
          <option value="BORRADOR">Borrador</option>
          <option value="CONFIRMADA">Confirmada</option>
          <option value="ANULADA">Anulada</option>
        </select></label
      ><label>Desde<input type="date" formControlName="desde" /></label
      ><label>Hasta<input type="date" formControlName="hasta" /></label
      ><button mat-stroked-button type="submit">Filtrar ventas</button
      ><button mat-button type="button" (click)="facade.list.reload()">Actualizar</button>
    </form>
    @if (facade.list.error(); as error) {
      <bm-alert [message]="error" />
    }
    @if (facade.list.loading()) {
      <bm-loading />
    } @else {
      <div class="record-list section-gap">
        @for (sale of facade.list.rows(); track sale.id) {
          <article class="record-row">
            <div>
              <h2>
                <a [routerLink]="['/admin/ventas', sale.id]">Venta #{{ sale.id }}</a>
              </h2>
              <p>
                {{ date(sale.creada_en) }} ·
                {{ sale.visita_id ? 'Visita #' + sale.visita_id : 'Mostrador' }}
              </p>
            </div>
            <div>
              <span class="badge">{{ sale.estado }}</span>
              <p>Total oficial {{ money(sale.total) }}</p>
            </div>
          </article>
        } @empty {
          <p class="empty-panel">No hay ventas para estos filtros.</p>
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
export class SalesList {
  readonly facade = inject(SalesFacade);
  readonly session = inject(SessionStore);
  readonly date = dateLima;
  readonly money = pen;
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
