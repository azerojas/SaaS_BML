import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { VisitsFacade } from '../application/visits-facade';
import { Clienta } from '../../clientas/domain/clienta';
import { ClientPicker } from '../../ventas/presentation/client-picker';
import { FinanceFeedback } from '../../ventas/presentation/finance-feedback';
import { FinanceResult } from '../../ventas/domain/sale';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
@Component({
  selector: 'bm-visit-create',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, ClientPicker, FinanceFeedback],
  providers: [VisitsFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<a routerLink="/admin/visitas" class="back-link">← Visitas</a>
    <header class="feature-heading"><h1>Abrir visita manual</h1></header>
    <bm-finance-feedback (recovered)="done($event)" /><bm-client-picker
      [disabled]="locked()"
      (picked)="client.set($event)"
    />
    @if (client(); as person) {
      <form class="surface phase4-form section-gap" [formGroup]="form" (ngSubmit)="save()">
        <h2>{{ person.nombres }} {{ person.apellidos }}</h2>
        <p>{{ person.telefono }}</p>
        <label class="check-row"
          ><input type="checkbox" formControlName="identidad" /> Verifiqué presencialmente que esta
          ficha corresponde a la persona atendida.</label
        ><label for="new-visit-notes">Notas de la atención</label
        ><textarea id="new-visit-notes" formControlName="notas" maxlength="10000"></textarea
        ><button mat-flat-button type="submit" [disabled]="locked() || form.invalid">
          Confirmar apertura de visita
        </button>
      </form>
    }`,
})
export class VisitCreate {
  readonly facade = inject(VisitsFacade);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  readonly confirming = signal(false);
  readonly client = signal<Clienta | null>(null);
  readonly form = inject(FormBuilder).nonNullable.group({
    identidad: [false, Validators.requiredTrue],
    notas: ['', Validators.maxLength(10000)],
  });
  locked() {
    return this.facade.intent.busy() || this.facade.intent.uncertain() || this.confirming();
  }
  async save() {
    const person = this.client();
    if (!person || this.form.invalid || this.locked()) return;
    this.confirming.set(true);
    try {
      if (
        await firstValueFrom(
          this.dialog
            .open(ConfirmDialog, {
              data: {
                title: 'Abrir visita para ' + person.nombres,
                description: 'Confirma la atención presencial. No se genera una venta ni un cobro.',
                confirm: 'Abrir visita',
              },
            })
            .afterClosed(),
        )
      ) {
        const result = await this.facade.create({
          clienta_id: person.id,
          notas: this.form.controls.notas.value,
        });
        if (result) await this.done(result);
      }
    } finally {
      this.confirming.set(false);
    }
  }
  async done(result: FinanceResult) {
    if (result.visita_id) await this.router.navigate(['/admin/visitas', result.visita_id]);
  }
}
