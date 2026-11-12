import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { VisitsFacade } from '../application/visits-facade';
import { SessionStore } from '../../../core/auth/application/session-store';
import { FinanceNav } from '../../ventas/presentation/finance-nav';
import { FinanceFeedback } from '../../ventas/presentation/finance-feedback';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { dateLima } from '../../inventario/domain/inventory';
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
  ],
  providers: [VisitsFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<bm-finance-nav /><a routerLink="/admin/visitas" class="back-link">← Visitas</a
    ><bm-finance-feedback (recovered)="refresh()" />
    @if (facade.error(); as error) {
      <bm-alert [message]="error" />
    }
    @if (facade.success(); as success) {
      <bm-alert kind="info" [message]="success" />
    }
    @if (facade.loading()) {
      <bm-loading />
    }
    @if (facade.record(); as visit) {
      <header class="feature-heading">
        <div>
          <p class="eyebrow">ATENCIÓN PRIVADA</p>
          <h1>Visita #{{ visit.id }}</h1>
          <span class="badge">{{ visit.estado }}</span>
        </div>
        <button mat-stroked-button [disabled]="locked()" (click)="refresh()">
          Consultar visita
        </button>
      </header>
      <section class="surface">
        <p>Ficha #{{ visit.clienta_id }} · Inicio {{ date(visit.inicio_en) }}</p>
        @if (visit.llegada_id) {
          <a [routerLink]="['/admin/llegadas', visit.llegada_id]"
            >Consultar llegada #{{ visit.llegada_id }}</a
          >
        }
        @if (visit.fin_en) {
          <p>Fin {{ date(visit.fin_en) }}</p>
        }
        <p class="preserve-lines">{{ visit.notas || 'Sin notas de atención.' }}</p>
        @if (visit.venta_id) {
          <a mat-flat-button [routerLink]="['/admin/ventas', visit.venta_id]">Ver venta y pagos</a>
        } @else if (visit.estado === 'ABIERTA' && session.hasPermission('finanzas.manage_sales')) {
          <a mat-flat-button routerLink="/admin/ventas/nueva" [queryParams]="{ visita: visit.id }"
            >Preparar tratamientos y venta</a
          >
        }
      </section>
      @if (visit.estado === 'ABIERTA' && session.hasPermission('finanzas.manage_visits')) {
        <form class="surface phase4-form section-gap" [formGroup]="form" (ngSubmit)="saveNotes()">
          <label for="visit-notes">Notas de atención</label
          ><textarea id="visit-notes" formControlName="notas" maxlength="10000"></textarea
          ><button mat-stroked-button type="submit" [disabled]="locked() || form.invalid">
            Guardar notas</button
          ><label for="visit-cancel-reason">Motivo de cancelación (8–250 caracteres)</label
          ><input id="visit-cancel-reason" formControlName="motivo" maxlength="250" /><button
            mat-button
            type="button"
            [disabled]="locked() || form.controls.motivo.value.trim().length < 8"
            (click)="cancel()"
          >
            Cancelar visita
          </button>
        </form>
      }
      <section class="surface section-gap">
        <h2>Historial de atención</h2>
        @for (event of visit.historial ?? []; track $index) {
          <p>{{ event.accion }} · {{ date(event.creada_en) }}</p>
        } @empty {
          <p>Sin eventos disponibles.</p>
        }
      </section>
    }`,
})
export class VisitDetail {
  readonly facade = inject(VisitsFacade);
  readonly session = inject(SessionStore);
  readonly date = dateLima;
  private readonly dialog = inject(MatDialog);
  readonly confirming = signal(false);
  private id = 0;
  readonly form = inject(FormBuilder).nonNullable.group({
    notas: ['', Validators.maxLength(10000)],
    motivo: ['', Validators.maxLength(250)],
  });
  constructor() {
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
  async refresh() {
    await this.facade.get(this.id);
    this.form.controls.notas.setValue(this.facade.record()?.notas ?? '');
  }
  async saveNotes() {
    if (!this.locked() && this.form.valid) await this.facade.notes(this.form.controls.notas.value);
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
