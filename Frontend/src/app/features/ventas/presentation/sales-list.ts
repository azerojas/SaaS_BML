import { DateField } from '../../../shared/ui/date-field';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SalesFacade } from '../application/sales-facade';
import { SessionStore } from '../../../core/auth/application/session-store';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Pager } from '../../../shared/ui/pager';
import { pen } from '../../../shared/domain/records';
import { dateLima } from '../../inventario/domain/inventory';
@Component({
  selector: 'bm-sales-list',
  imports: [
    DateField,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    Alert,
    Loading,
    Pager,
  ],
  providers: [SalesFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sales-list.html',
  styleUrl: './sales-list.scss',
})
export class SalesList {
  readonly facade = inject(SalesFacade);
  readonly session = inject(SessionStore);
  readonly date = dateLima;
  readonly money = pen;
  readonly Number = Number;
  readonly form = inject(FormBuilder).nonNullable.group({ estado: '', desde: '', hasta: '' });
  constructor() {
    this.refresh();
  }
  refresh() {
    this.facade.list.reload();
    this.facade.payments.reload();
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
