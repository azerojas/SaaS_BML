import { UnsavedForm } from '../../../core/forms/unsaved-form';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  TemplateRef,
} from '@angular/core';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SessionStore } from '../../../core/auth/application/session-store';
import { RecordState } from '../../../shared/application/operation-state';
import { AgendaApi } from '../infrastructure/agenda-api';
import { AgendaIntent } from '../application/agenda-intent';
import { AppointmentDetail, Availability, Slot } from '../domain/agenda';
import { AgendaFeedback } from './agenda-feedback';
import { SlotPicker } from './slot-picker';
import { AdvancesPanel } from './advances-panel';
import { localDateTime, money } from '../../dashboard/domain/analytics';
import { Alert } from '../../../shared/ui/alert';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Icon } from '../../../shared/ui/icon';
import { ReportResource } from '../../dashboard/application/report-resource';
import { Professional } from '../domain/agenda';
@Component({
  selector: 'bm-appointment-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Alert,
    AgendaFeedback,
    SlotPicker,
    AdvancesPanel,
    UnsavedForm,
    MatDialogModule,
    MatButtonModule,
    Icon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './appointment-page.html',
  styleUrl: './appointment-page.scss',
})
export class AppointmentPage {
  readonly session = inject(SessionStore);
  readonly intent = inject(AgendaIntent);
  private readonly api = inject(AgendaApi);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private rescheduleDialog: MatDialogRef<unknown> | null = null;
  readonly professionals = new ReportResource<Professional[]>(() =>
    this.api.all<Professional>('profesionales/'),
  );
  readonly state = new RecordState<AppointmentDetail>();
  readonly refresh = signal(0);
  readonly ids = computed(() => this.state.record()?.servicios.map((row) => row.servicio_id) ?? []);
  readonly choice = signal<{ slot: Slot; availability: Availability } | null>(null);
  readonly localDateTime = localDateTime;
  readonly money = money;
  private readonly fb = inject(FormBuilder);
  readonly actionForm = this.fb.nonNullable.group({
    action: 'confirmar',
    reason: '',
    override: false,
    reviewed: false,
  });
  readonly rescheduleForm = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(250)]],
    reviewed: [false, Validators.requiredTrue],
  });
  readonly arrivalForm = this.fb.nonNullable.group({
    arrival: ['', [Validators.required, Validators.pattern(/^[1-9]\d*$/)]],
    reviewed: [false, Validators.requiredTrue],
  });
  private expiryChecked = '';
  constructor() {
    this.professionals.load({});
    effect((onCleanup) => {
      const cita = this.state.record();
      if (!cita || cita.estado !== 'PENDIENTE_PAGO' || !cita.expira_en || this.intent.busy())
        return;
      const key = cita.id + ':' + cita.expira_en;
      if (this.expiryChecked === key) return;
      const remaining = Date.parse(cita.expira_en) - Date.now();
      if (!Number.isFinite(remaining)) return;
      const timer = setTimeout(
        () => {
          this.expiryChecked = key;
          this.load();
        },
        Math.max(0, remaining) + 1000,
      );
      onCleanup(() => clearTimeout(timer));
    });
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(() => this.load());
  }
  load() {
    this.choice.set(null);
    this.refresh.update((n) => n + 1);
    void this.state.load(
      this.api.get<AppointmentDetail>('citas/' + this.route.snapshot.paramMap.get('id') + '/'),
    );
  }
  active(state: string) {
    return ['PENDIENTE_PAGO', 'PROGRAMADA', 'CONFIRMADA'].includes(state);
  }
  professionalName(id: number) {
    const professional = this.professionals.data()?.find((row) => row.id === id);
    return professional
      ? professional.nombres + ' ' + professional.apellidos
      : 'Profesional #' + id;
  }
  statusLabel(state: string) {
    return (
      (
        {
          CONFIRMADA: 'Confirmada',
          PROGRAMADA: 'Programada',
          PENDIENTE_PAGO: 'Pendiente de anticipo',
          CANCELADA: 'Cancelada',
          EXPIRADA: 'Expirada',
          NO_ASISTIO: 'No asistió',
          COMPLETADA: 'Completada',
        } as Record<string, string>
      )[state] ?? state
    );
  }
  openReschedule(template: TemplateRef<unknown>) {
    const cita = this.state.record();
    if (
      !cita ||
      !this.active(cita.estado) ||
      cita.visita_id ||
      this.intent.busy() ||
      this.intent.pending()
    )
      return;
    this.choice.set(null);
    this.rescheduleForm.reset({ reason: '', reviewed: false });
    this.rescheduleDialog = this.dialog.open(template, {
      width: '760px',
      maxWidth: 'calc(100vw - 24px)',
      autoFocus: 'first-heading',
      closePredicate: () => !this.intent.busy() && !this.intent.pending(),
    });
  }
  finishReschedule() {
    this.rescheduleDialog?.close();
    this.rescheduleDialog = null;
    this.rescheduleForm.reset({ reason: '', reviewed: false });
    this.load();
  }
  actionAllowed(state: string) {
    const action = this.actionForm.controls.action.value;
    return action === 'confirmar'
      ? ['PROGRAMADA', 'PENDIENTE_PAGO'].includes(state)
      : action === 'completar'
        ? state === 'CONFIRMADA'
        : this.active(state);
  }
  async action() {
    const cita = this.state.record(),
      value = this.actionForm.getRawValue();
    if (!cita || !value.reviewed || !this.actionAllowed(cita.estado)) return;
    const reasonNeeded = ['cancelar', 'no-asistio'].includes(value.action);
    if (reasonNeeded && (value.reason.trim().length < 8 || value.reason.length > 250)) {
      this.intent.error.set('Indica un motivo de 8 a 250 caracteres.');
      return;
    }
    const body =
      value.action === 'cancelar'
        ? { motivo: value.reason, fuera_plazo_autorizado: value.override }
        : reasonNeeded
          ? { motivo: value.reason }
          : {};
    if (
      await this.intent.send(this.api.path('citas/' + cita.id + '/' + value.action + '/'), body)
    ) {
      this.actionForm.controls.reviewed.setValue(false);
      this.load();
    }
  }
  async reschedule() {
    const cita = this.state.record(),
      chosen = this.choice();
    if (!cita || !chosen || this.rescheduleForm.invalid) return;
    if (
      await this.intent.send(this.api.path('citas/' + cita.id + '/reprogramar/'), {
        inicio_en: chosen.slot.inicio_en,
        profesional_id: chosen.availability.profesional_id,
        motivo: this.rescheduleForm.controls.reason.value,
      })
    ) {
      this.finishReschedule();
    } else if (this.intent.failure()?.status === 409) {
      this.choice.set(null);
      this.refresh.update((n) => n + 1);
    }
  }
  async link() {
    const cita = this.state.record();
    if (!cita || this.arrivalForm.invalid) return;
    if (
      await this.intent.send(this.api.path('citas/' + cita.id + '/vincular-llegada/'), {
        llegada_id: Number(this.arrivalForm.controls.arrival.value),
      })
    )
      this.load();
  }
}
