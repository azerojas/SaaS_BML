import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { ArrivalsFacade } from '../application/arrivals-facade';
import { SessionStore } from '../../../core/auth/application/session-store';
import { FinanceNav } from '../../ventas/presentation/finance-nav';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { ValidationSummary } from '../../../shared/ui/validation-summary';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { dateLima } from '../../inventario/domain/inventory';
@Component({
  selector: 'bm-arrival-detail',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    FinanceNav,
    Alert,
    Loading,
    ValidationSummary,
  ],
  providers: [ArrivalsFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<bm-finance-nav /><a routerLink="/admin/llegadas" class="back-link">← Llegadas</a>
    @if (facade.error(); as error) {
      <bm-alert [message]="error" />
    }
    <bm-validation-summary [errors]="facade.fields()" />
    @if (facade.success(); as success) {
      <bm-alert kind="info" [message]="success" />
    }
    @if (facade.loading()) {
      <bm-loading />
    }
    @if (facade.record(); as arrival) {
      <header class="feature-heading">
        <div>
          <p class="eyebrow">VERIFICACIÓN PRESENCIAL</p>
          <h1>Llegada #{{ arrival.id }}</h1>
          <span class="badge">{{ arrival.estado }}</span>
        </div>
        <button mat-stroked-button [disabled]="facade.busy()" (click)="facade.get(arrival.id)">
          Consultar estado
        </button>
      </header>
      <section class="surface">
        <h2>{{ arrival.nombres }} {{ arrival.apellidos }}</h2>
        <p>{{ arrival.telefono }} · {{ date(arrival.solicitada_en) }}</p>
        <p>
          {{
            arrival.alta_provisional
              ? 'Ficha provisional: verifica identidad y consentimiento antes de activarla.'
              : 'Ficha existente: comprueba que la persona presente corresponde a estos datos.'
          }}
        </p>
        @if (arrival.ultima_resolucion; as resolution) {
          <p>Última resolución: {{ resolution.accion }} · {{ date(resolution.creada_en) }}</p>
        }
      </section>
      @if (arrival.estado === 'PENDIENTE' && session.hasPermission('negocio.change_llegadas')) {
        <form
          class="surface phase4-form section-gap"
          [formGroup]="form"
          (ngSubmit)="resolve('confirmar')"
        >
          @if (arrival.vencida) {
            <bm-alert
              message="La llegada venció. Cancélala y solicita un nuevo registro; no puede confirmarse."
            />
          }
          <label class="check-row"
            ><input type="checkbox" formControlName="identidad" /> Verifiqué presencialmente la
            identidad de la clienta.</label
          >
          @if (arrival.alta_provisional) {
            <label class="check-row"
              ><input type="checkbox" formControlName="consentimiento" /> Verifiqué su
              consentimiento y la declaración del aviso vigente.</label
            >
          }
          <label for="arrival-reason">Motivo o constancia breve (sin datos innecesarios)</label
          ><input id="arrival-reason" formControlName="motivo" maxlength="250" />
          <div class="form-actions">
            <button
              mat-flat-button
              type="submit"
              [disabled]="
                locked() ||
                arrival.vencida ||
                !form.controls.identidad.value ||
                (arrival.alta_provisional && !form.controls.consentimiento.value)
              "
            >
              Confirmar identidad y llegada</button
            ><button
              mat-stroked-button
              type="button"
              [disabled]="locked()"
              (click)="resolve('rechazar')"
            >
              Rechazar llegada</button
            ><button mat-button type="button" [disabled]="locked()" (click)="resolve('cancelar')">
              Cancelar llegada
            </button>
          </div>
        </form>
      }
      @if (arrival.estado === 'CONFIRMADA') {
        <section class="surface section-gap">
          <h2>Atención</h2>
          @if (arrival.visita; as visit) {
            <p>Visita #{{ visit.id }} · {{ visit.estado }}</p>
            @if (session.hasPermission('finanzas.view_finance')) {
              <a mat-flat-button [routerLink]="['/admin/visitas', visit.id]">Abrir visita</a>
            }
          } @else if (
            session.hasPermission('negocio.change_llegadas') &&
            session.hasPermission('finanzas.manage_visits')
          ) {
            <button mat-flat-button [disabled]="locked()" (click)="visit()">
              Crear visita desde llegada
            </button>
            <form
              class="phase4-form section-gap"
              [formGroup]="association"
              (ngSubmit)="associate()"
            >
              <label for="existing-visit"
                >O vincular visita abierta existente de esta clienta (ID)</label
              ><input id="existing-visit" inputmode="numeric" formControlName="visita" /><button
                mat-stroked-button
                type="submit"
                [disabled]="locked() || association.invalid"
              >
                Vincular visita existente
              </button>
            </form>
          }
        </section>
        @if (
          arrival.visita &&
          session.hasPermission('negocio.change_llegadas') &&
          session.hasPermission('agenda.link_arrivals')
        ) {
          <section class="surface section-gap">
            <h2>Citas compatibles sugeridas</h2>
            @for (appointment of arrival.citas_sugeridas; track appointment.id) {
              <p>
                Cita #{{ appointment.id }} · {{ date(appointment.inicio_en) }}
                <button mat-stroked-button [disabled]="locked()" (click)="link(appointment.id)">
                  Enlazar cita #{{ appointment.id }}
                </button>
              </p>
            } @empty {
              <p>No hay citas compatibles pendientes de enlace.</p>
            }
          </section>
        }
      }
    }`,
})
export class ArrivalDetailPage {
  readonly facade = inject(ArrivalsFacade);
  readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  readonly confirming = signal(false);
  readonly date = dateLima;
  private readonly fb = inject(FormBuilder);
  readonly form = this.fb.nonNullable.group({
    identidad: false,
    consentimiento: false,
    motivo: ['', Validators.maxLength(250)],
  });
  readonly association = this.fb.nonNullable.group({
    visita: ['', [Validators.required, Validators.pattern(/^[1-9]\d*$/)]],
  });
  constructor() {
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.form.reset();
        void this.facade.get(Number(params.get('id')));
      });
  }
  locked() {
    return this.facade.busy() || this.facade.loading() || this.confirming();
  }
  async confirm(title: string, description: string, action: () => Promise<unknown>) {
    if (this.locked()) return;
    this.confirming.set(true);
    try {
      if (
        await firstValueFrom(
          this.dialog
            .open(ConfirmDialog, { data: { title, description, confirm: 'Confirmar' } })
            .afterClosed(),
        )
      )
        await action();
    } finally {
      this.confirming.set(false);
    }
  }
  async resolve(action: 'confirmar' | 'rechazar' | 'cancelar') {
    const raw = this.form.getRawValue();
    const arrival = this.facade.record();
    if (!arrival || this.form.invalid) return;
    if (
      action === 'confirmar' &&
      (!raw.identidad || (arrival.alta_provisional && !raw.consentimiento) || arrival.vencida)
    )
      return;
    await this.confirm(
      action === 'confirmar'
        ? 'Confirmar llegada e identidad'
        : action === 'rechazar'
          ? 'Rechazar llegada'
          : 'Cancelar llegada',
      'Esta decisión quedará registrada para la persona mostrada. Comprueba los datos antes de continuar.',
      () =>
        this.facade.resolve(
          action,
          action === 'confirmar'
            ? {
                identidad_verificada: true,
                consentimiento_verificado: raw.consentimiento,
                motivo: raw.motivo,
              }
            : { motivo: raw.motivo },
        ),
    );
  }
  async visit() {
    const id = this.facade.record()?.id;
    if (!id || this.locked()) return;
    const result = await this.facade.createVisit(id);
    if (result && this.session.hasPermission('finanzas.view_finance'))
      await this.router.navigate(['/admin/visitas', result.id]);
    else await this.facade.get(id);
  }
  async associate() {
    const id = this.facade.record()?.id;
    if (!id || this.association.invalid) return;
    await this.confirm(
      'Vincular visita existente',
      'Django comprobará que corresponde a esta clienta y no tiene otra llegada.',
      () => this.facade.associate(id, Number(this.association.controls.visita.value)),
    );
  }
  async link(cita: number) {
    const id = this.facade.record()?.id;
    if (!id) return;
    await this.confirm(
      'Enlazar cita #' + cita,
      'Vincula esta cita a la visita mostrada. No crea una reserva ni cobra anticipos.',
      () => this.facade.link(id, cita),
    );
  }
}
