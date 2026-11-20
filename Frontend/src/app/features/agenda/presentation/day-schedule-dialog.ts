import { DateField } from '../../../shared/ui/date-field';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { firstValueFrom, forkJoin } from 'rxjs';
import { distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AgendaApi } from '../infrastructure/agenda-api';
import { AgendaIntent } from '../application/agenda-intent';
import { DailySchedule, DayInterval } from '../domain/agenda';
import { TimeField } from './time-field';
import { addDays, limaToday } from '../../dashboard/domain/periods';
import { Alert } from '../../../shared/ui/alert';
import { Icon } from '../../../shared/ui/icon';
import { AgendaFeedback } from './agenda-feedback';
import { mergeDayIntervals } from '../domain/calendar-layout';

export interface DayScheduleDialogData {
  date: string;
  selection?: DayInterval;
  professionalId?: number | null;
  professionalName?: string;
}
export interface DayScheduleResult {
  date: string;
}
@Component({
  selector: 'bm-day-schedule-dialog',
  imports: [
    DateField,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    Alert,
    Icon,
    AgendaFeedback,
    TimeField,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './day-schedule-dialog.html',
  styleUrl: './day-schedule-dialog.scss',
})
export class DayScheduleDialog {
  readonly data = inject<DayScheduleDialogData>(MAT_DIALOG_DATA);
  readonly singleSlots = !!this.data.professionalId;
  readonly intent = inject(AgendaIntent);
  private readonly api = inject(AgendaApi);
  private readonly ref = inject(MatDialogRef<DayScheduleDialog, DayScheduleResult>);
  private readonly fb = inject(FormBuilder);
  readonly error = signal('');
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly source = signal('');
  readonly closed = signal(false);
  readonly saved = signal(false);
  readonly today = limaToday();
  private sequence = 0;
  readonly form = this.fb.nonNullable.group({
    date: [this.data.date, Validators.required],
    intervals: this.fb.array<ReturnType<DayScheduleDialog['interval']>>([]),
  });
  get intervals() {
    return this.form.controls.intervals;
  }
  get past() {
    return this.form.controls.date.value < limaToday();
  }
  constructor() {
    this.form.controls.date.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => void this.load());
    void this.load();
  }
  private interval(begin = '09:00', end = '18:00') {
    return this.fb.nonNullable.group({
      inicio: [begin, [Validators.required, Validators.pattern(/^([01]\d|2[0-3]):[0-5]\d$/)]],
      fin: [end, [Validators.required, Validators.pattern(/^([01]\d|2[0-3]):[0-5]\d$/)]],
    });
  }
  add() {
    if (this.intervals.length >= 12) return;
    const last = this.intervals.at(-1)?.controls.fin.value ?? '09:00';
    const hour = Number(last.slice(0, 2));
    this.intervals.push(
      this.interval(
        last,
        Math.min(hour + 1, 23)
          .toString()
          .padStart(2, '0') +
          ':' +
          last.slice(3, 5),
      ),
    );
    this.closed.set(false);
  }
  remove(index: number) {
    this.intervals.removeAt(index);
    if (!this.intervals.length) this.closed.set(true);
  }
  setClosed(value: boolean) {
    this.closed.set(value);
    if (!value && !this.intervals.length) this.add();
  }
  async load() {
    const seq = ++this.sequence;
    const date = this.form.controls.date.value;
    if (!date) {
      this.loaded.set(false);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.loaded.set(false);
    try {
      const data = await firstValueFrom(
        forkJoin({
          daily: this.api.all<DailySchedule>('disponibilidad-diaria/', {
            ...(this.singleSlots
              ? { profesional_id: this.data.professionalId! }
              : { ambito: 'general' }),
            desde: date,
            hasta: addDays(date, 1),
          }),
        }),
      );
      if (seq !== this.sequence) return;
      const override = data.daily[0];
      const hours: DayInterval[] = override?.franjas ?? [];
      this.intervals.clear();
      const intervals = this.data.selection
        ? this.singleSlots
          ? this.withSlot(hours, this.data.selection)
          : mergeDayIntervals([...hours, this.data.selection])
        : hours;
      for (const row of intervals) this.intervals.push(this.interval(row.inicio, row.fin));
      this.closed.set(!!override && intervals.length === 0);
      this.source.set(
        override ? 'Horarios guardados para esta fecha' : 'Añade tus horas disponibles',
      );
      this.loaded.set(true);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo consultar la jornada.');
    } finally {
      if (seq === this.sequence) this.loading.set(false);
    }
  }
  async save() {
    if (
      !this.loaded() ||
      this.past ||
      this.intent.busy() ||
      this.intent.pending() ||
      !this.form.controls.date.valid
    )
      return;
    const hours = this.closed() ? [] : this.intervals.getRawValue();
    if (
      !this.closed() &&
      (!hours.length || this.intervals.invalid || hours.some((row) => row.inicio >= row.fin))
    ) {
      this.error.set('Añade franjas válidas: la hora de fin debe ser posterior al inicio.');
      return;
    }
    const result = await this.intent.send(this.api.path('disponibilidad-diaria/'), {
      fecha: this.form.controls.date.value,
      ...(this.singleSlots ? { profesional_id: this.data.professionalId } : {}),
      franjas: this.singleSlots ? hours.map((row) => ({ ...row, cupo_unico: true })) : hours,
    });
    if (result) this.finish();
  }
  async restore() {
    if (!this.loaded() || this.past || this.intent.busy() || this.intent.pending()) return;
    const result = await this.intent.send(this.api.path('disponibilidad-diaria/restablecer/'), {
      fecha: this.form.controls.date.value,
    });
    if (result) this.finish();
  }
  finish() {
    this.saved.set(true);
    this.ref.close({
      date: this.form.controls.date.value,
    });
  }
  preset(inicio: string, fin: string) {
    const rows = this.singleSlots
      ? this.withSlot(this.intervals.getRawValue(), { inicio, fin })
      : mergeDayIntervals([...this.intervals.getRawValue(), { inicio, fin }]);
    if (rows.length > 12) return;
    this.intervals.clear();
    for (const row of rows) this.intervals.push(this.interval(row.inicio, row.fin));
    this.closed.set(false);
  }
  private withSlot(rows: DayInterval[], addition: DayInterval): DayInterval[] {
    if (rows.some((row) => row.inicio === addition.inicio && row.fin === addition.fin)) return rows;
    if (rows.some((row) => row.inicio < addition.fin && addition.inicio < row.fin)) {
      this.error.set('Los cupos no pueden superponerse. Revisa el inicio y el fin de cada uno.');
      return rows;
    }
    return [...rows, addition].sort((a, b) => a.inicio.localeCompare(b.inicio));
  }
  get duration() {
    const minutes = this.closed()
      ? 0
      : this.intervals.getRawValue().reduce((sum, row) => {
          const start = Number(row.inicio.slice(0, 2)) * 60 + Number(row.inicio.slice(3));
          const end = Number(row.fin.slice(0, 2)) * 60 + Number(row.fin.slice(3));
          return sum + (Number.isFinite(end - start) && end > start ? end - start : 0);
        }, 0);
    return (
      new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(minutes / 60) +
      ' h disponibles'
    );
  }
}
