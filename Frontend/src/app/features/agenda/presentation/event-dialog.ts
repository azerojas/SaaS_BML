import { DateField } from '../../../shared/ui/date-field';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { SessionStore } from '../../../core/auth/application/session-store';
import { UnsavedForm } from '../../../core/forms/unsaved-form';
import { PagedState } from '../../../shared/application/paged-state';
import { Alert } from '../../../shared/ui/alert';
import { Icon } from '../../../shared/ui/icon';
import { Pager } from '../../../shared/ui/pager';
import { ClientasApi } from '../../clientas/infrastructure/clientas-api';
import { Clienta } from '../../clientas/domain/clienta';
import { CatalogApi } from '../../catalogo/infrastructure/catalog-api';
import { CatalogRecord } from '../../catalogo/domain/catalog';
import { AgendaApi } from '../infrastructure/agenda-api';
import { AgendaIntent } from '../application/agenda-intent';
import { AppointmentDetail, Availability, MutationResult, Professional } from '../domain/agenda';
import { limaToday } from '../../dashboard/domain/periods';
import { money } from '../../dashboard/domain/analytics';
import { AgendaFeedback } from './agenda-feedback';

export interface EventDialogData {
  date: string;
  time: string;
  professionalId: string;
  professionals: Professional[];
  appointment?: AppointmentDetail;
}

@Component({
  selector: 'bm-event-dialog',
  imports: [
    DateField,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    UnsavedForm,
    Alert,
    Icon,
    Pager,
    AgendaFeedback,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './event-dialog.html',
  styleUrl: './event-dialog.scss',
})
export class EventDialog {
  readonly data = inject<EventDialogData>(MAT_DIALOG_DATA);
  readonly intent = inject(AgendaIntent);
  readonly session = inject(SessionStore);
  private readonly api = inject(AgendaApi);
  private readonly clientApi = inject(ClientasApi);
  private readonly catalog = inject(CatalogApi);
  private readonly ref = inject(MatDialogRef<EventDialog, MutationResult>);
  private readonly destroy = inject(DestroyRef);
  readonly editing = !!this.data.appointment;
  readonly today = limaToday();
  readonly client = signal<Clienta | null>(null);
  readonly services = signal<CatalogRecord[]>([]);
  readonly ids = computed(() =>
    this.editing
      ? this.data.appointment!.servicios.map((row) => row.servicio_id)
      : this.services().map((row) => row.id),
  );
  readonly eligible = computed(() =>
    this.data.professionals.filter(
      (row) => row.activa && this.ids().every((id) => row.servicios?.includes(id)),
    ),
  );
  readonly clients = new PagedState(
    (query) => this.clientApi.list({ ...query, activa: 'true' }),
    false,
  );
  readonly catalogRows = new PagedState(
    (query) => this.catalog.list('servicios', { ...query, activo: 'true' }),
    false,
  );
  readonly availability = signal<Availability | null>(null);
  readonly checking = signal(false);
  readonly error = signal('');
  readonly serviceSearch = inject(FormBuilder).nonNullable.control('');
  readonly clientSearch = inject(FormBuilder).nonNullable.control('');
  readonly form = inject(FormBuilder).nonNullable.group({
    date: [this.data.date, Validators.required],
    time: [this.data.time, [Validators.required, Validators.pattern(/^\d{2}:\d{2}$/)]],
    professional: [this.data.professionalId, Validators.required],
    notes: ['', Validators.maxLength(5000)],
    reason: [
      '',
      this.editing ? [Validators.required, Validators.minLength(8), Validators.maxLength(250)] : [],
    ],
  });
  readonly values = signal(this.form.getRawValue());
  readonly query = computed(() =>
    JSON.stringify({
      date: this.values().date,
      professional: this.values().professional,
      services: this.ids(),
    }),
  );
  private sequence = 0;
  private readonly loadedQuery = signal('');
  readonly choice = computed(() => {
    if (this.query() !== this.loadedQuery()) return null;
    const value = this.values();
    const instant = Date.parse(value.date + 'T' + value.time + ':00-05:00');
    return this.availability()?.slots.find((row) => Date.parse(row.inicio_en) === instant) ?? null;
  });
  readonly end = computed(() => {
    const minutes = this.availability()?.duracion_minutos;
    const value = this.values();
    if (!minutes || this.query() !== this.loadedQuery() || !/^\d{2}:\d{2}$/.test(value.time))
      return '—';
    const instant = new Date(
      Date.parse(value.date + 'T' + value.time + ':00-05:00') + minutes * 60000,
    );
    return Number.isNaN(instant.getTime()) ? '—' : this.time(instant.toISOString());
  });
  readonly money = money;
  readonly Number = Number;
  constructor() {
    this.ref.disableClose = true;
    this.ref
      .backdropClick()
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.close());
    this.ref
      .keydownEvents()
      .pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          this.close();
        }
      });
    this.form.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.values.set(this.form.getRawValue()));
    this.destroy.onDestroy(() => {
      this.sequence++;
    });
    effect(() => {
      const query = this.query();
      untracked(() => void this.check(query));
    });
    if (!this.editing && this.session.hasPermission('negocio.view_servicios'))
      this.catalogRows.filter({});
    if (this.data.appointment && this.session.hasPermission('negocio.view_clientas')) {
      this.clientApi
        .get(this.data.appointment.clienta_id)
        .pipe(takeUntilDestroyed())
        .subscribe({
          next: (client) => this.client.set(client),
          error: () =>
            this.error.set('No se pudo consultar la clienta. Puedes volver a abrir la cita.'),
        });
    }
  }
  searchClients() {
    if (this.session.hasPermission('negocio.view_clientas'))
      this.clients.filter({ search: this.clientSearch.value });
  }
  selectClient(client: Clienta) {
    this.client.set(client);
    this.form.markAsDirty();
  }
  addService(row: CatalogRecord | undefined) {
    if (!row || this.editing || this.services().length >= 10 || this.ids().includes(row.id)) return;
    this.services.update((rows) => [...rows, row]);
    this.form.markAsDirty();
    this.selectProfessional();
  }
  removeService(id: number) {
    this.services.update((rows) => rows.filter((row) => row.id !== id));
    this.form.markAsDirty();
    this.selectProfessional();
  }
  private selectProfessional() {
    const current = Number(this.form.controls.professional.value);
    if (!this.eligible().some((row) => row.id === current))
      this.form.controls.professional.setValue(
        this.eligible().length === 1 ? String(this.eligible()[0].id) : '',
      );
    else if (!current && this.eligible().length === 1)
      this.form.controls.professional.setValue(String(this.eligible()[0].id));
  }
  async check(query: string) {
    const seq = ++this.sequence;
    const value = JSON.parse(query) as { date: string; professional: string; services: number[] };
    this.availability.set(null);
    this.loadedQuery.set('');
    this.error.set('');
    this.checking.set(false);
    if (!value.date || !value.professional || !value.services.length) return;
    this.checking.set(true);
    try {
      const result = await firstValueFrom(
        this.api
          .availability(
            value.date,
            Number(value.professional),
            value.services,
            this.data.appointment?.id,
          )
          .pipe(takeUntilDestroyed(this.destroy)),
      );
      if (seq !== this.sequence) return;
      this.availability.set(result);
      this.loadedQuery.set(query);
    } catch (error) {
      if (seq === this.sequence)
        this.error.set(
          error instanceof Error ? error.message : 'No se pudo consultar la disponibilidad.',
        );
    } finally {
      if (seq === this.sequence) this.checking.set(false);
    }
  }
  chooseTime(value: string) {
    this.form.controls.time.setValue(this.time(value));
    this.form.markAsDirty();
  }
  time(value: string) {
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(value));
  }
  async save() {
    const choice = this.choice();
    if (
      !choice ||
      this.form.invalid ||
      this.intent.busy() ||
      this.intent.pending() ||
      (!this.editing && !this.client())
    )
      return;
    const value = this.form.getRawValue();
    const result = await this.intent.send(
      this.api.path(
        this.editing ? 'citas/' + this.data.appointment!.id + '/reprogramar/' : 'citas/',
      ),
      this.editing
        ? {
            profesional_id: Number(value.professional),
            inicio_en: choice.inicio_en,
            motivo: value.reason,
          }
        : {
            clienta_id: this.client()!.id,
            profesional_id: Number(value.professional),
            servicios: this.ids(),
            inicio_en: choice.inicio_en,
            notas: value.notes,
            origen: 'MANUAL',
          },
    );
    if (result) this.done(result);
    else if (this.intent.failure()?.status === 409 && !this.intent.pending())
      await this.check(this.query());
  }
  done(result: MutationResult) {
    if (!result.cita_id) return;
    this.form.markAsPristine();
    this.ref.close(result);
  }
  close() {
    if (this.intent.busy()) return;
    if (this.form.dirty && !window.confirm('Hay cambios sin guardar. ¿Quieres cerrar esta cita?'))
      return;
    this.ref.close();
  }
}
