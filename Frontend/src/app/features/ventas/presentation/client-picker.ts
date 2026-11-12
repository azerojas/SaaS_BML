import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { LookupsFacade } from '../application/lookups-facade';
import { Clienta } from '../../clientas/domain/clienta';
import { Alert } from '../../../shared/ui/alert';
import { Pager } from '../../../shared/ui/pager';
@Component({
  selector: 'bm-client-picker',
  imports: [ReactiveFormsModule, MatButtonModule, Alert, Pager],
  providers: [LookupsFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="surface phase4-form">
    <h2>Seleccionar clienta activa</h2>
    <form
      [formGroup]="form"
      (ngSubmit)="facade.clients.filter({ search: form.controls.search.value })"
    >
      <label>Buscar clienta por nombre o teléfono<input formControlName="search" /></label
      ><button mat-stroked-button type="submit" [disabled]="disabled() || facade.clients.loading()">
        Buscar clienta
      </button>
    </form>
    @if (facade.clients.error(); as error) {
      <bm-alert [message]="error" />
    }
    <div class="lookup-results">
      @for (client of facade.clients.rows(); track client.id) {
        <button
          mat-stroked-button
          type="button"
          [disabled]="disabled()"
          (click)="picked.emit(client)"
        >
          {{ client.nombres }} {{ client.apellidos }} · {{ client.telefono }}
        </button>
      }
    </div>
    <bm-pager
      [count]="facade.clients.count()"
      [page]="Number(facade.clients.query()['page'])"
      [busy]="facade.clients.loading()"
      (changed)="facade.clients.page($event)"
    />
  </section>`,
})
export class ClientPicker {
  readonly facade = inject(LookupsFacade);
  readonly Number = Number;
  readonly disabled = input(false);
  readonly picked = output<Clienta>();
  readonly form = inject(FormBuilder).nonNullable.group({ search: '' });
}
