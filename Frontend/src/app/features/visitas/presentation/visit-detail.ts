import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { VisitsFacade } from '../application/visits-facade';
import { SessionStore } from '../../../core/auth/application/session-store';
import { FinanceNav } from '../../ventas/presentation/finance-nav';
import { FinanceFeedback } from '../../ventas/presentation/finance-feedback';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Icon } from '../../../shared/ui/icon';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { dateLima } from '../../inventario/domain/inventory';
export interface VisitDetailData {
  id: number;
  clientName?: string;
}

@Component({
  selector: 'bm-visit-detail',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    FinanceNav,
    FinanceFeedback,
    Alert,
    Loading,
    Icon,
    NgTemplateOutlet,
    MatDialogModule,
  ],
  providers: [VisitsFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './visit-detail.html',
  styleUrl: './visit-detail.scss',
})
export class VisitDetail {
  readonly data = inject<VisitDetailData | null>(MAT_DIALOG_DATA, { optional: true });
  readonly ref = inject<MatDialogRef<VisitDetail> | null>(MatDialogRef, { optional: true });
  readonly inDialog = !!this.ref;
  readonly facade = inject(VisitsFacade);
  readonly session = inject(SessionStore);
  readonly date = dateLima;
  private readonly dialog = inject(MatDialog);
  readonly confirming = signal(false);
  id = 0;
  readonly form = inject(FormBuilder).nonNullable.group({
    notas: ['', Validators.maxLength(10000)],
    motivo: ['', Validators.maxLength(250)],
  });
  constructor() {
    effect(() => {
      if (this.ref) this.ref.disableClose = this.facade.intent.busy() || this.confirming();
    });
    if (this.data) {
      this.id = this.data.id;
      void this.refresh();
      return;
    }
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.id = Number(params.get('id'));
        void this.refresh();
      });
  }
  locked() {
    return (
      this.facade.intent.busy() ||
      this.facade.intent.uncertain() ||
      this.facade.loading() ||
      this.confirming()
    );
  }
  close() {
    if (!this.facade.intent.busy() && !this.confirming()) this.ref?.close();
  }
  clientLabel() {
    return this.data?.clientName || 'Ficha #' + this.facade.record()?.clienta_id;
  }
  statusLabel() {
    const state = this.facade.record()?.estado;
    return state === 'ABIERTA'
      ? 'En atención'
      : state === 'FINALIZADA'
        ? 'Atención finalizada'
        : 'Visita cancelada';
  }
  eventLabel(action: string) {
    return (
      (
        {
          ABRIR_VISITA: 'Visita abierta',
          INICIAR_VISITA_QR: 'Visita abierta por QR',
          CANCELAR_VISITA: 'Visita cancelada',
          FINALIZAR_VISITA: 'Atención finalizada',
          EDITAR_NOTAS: 'Notas actualizadas',
          NOTAS_VISITA: 'Notas actualizadas',
          EDITAR_VISITA: 'Notas actualizadas',
        } as Record<string, string>
      )[action] ?? action.replaceAll('_', ' ').toLocaleLowerCase('es')
    );
  }
  async refresh() {
    await this.facade.get(this.id);
    this.form.controls.notas.setValue(this.facade.record()?.notas ?? '');
  }
  async saveNotes() {
    if (!this.locked() && this.form.controls.notas.valid)
      await this.facade.notes(this.form.controls.notas.value);
  }
  async cancel() {
    if (this.locked() || this.form.controls.motivo.value.trim().length < 8) return;
    this.confirming.set(true);
    try {
      if (
        await firstValueFrom(
          this.dialog
            .open(ConfirmDialog, {
              data: {
                title: 'Cancelar visita',
                description: 'Solo se permite sin venta vigente. El historial se conserva.',
                confirm: 'Cancelar visita',
              },
            })
            .afterClosed(),
        )
      )
        await this.facade.resolve('cancelar', this.form.controls.motivo.value.trim());
    } finally {
      this.confirming.set(false);
    }
  }
}
