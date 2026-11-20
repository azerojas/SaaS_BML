import { DateField } from '../../../shared/ui/date-field';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  effect,
  untracked,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom, forkJoin, map, of } from 'rxjs';
import { SessionStore } from '../../../core/auth/application/session-store';
import { AgendaApi } from '../infrastructure/agenda-api';
import {
  Appointment,
  AppointmentDetail,
  APPOINTMENT_STATES,
  Block,
  CalendarView,
  DailySchedule,
  DayInterval,
  Professional,
  Schedule,
  calendarDays,
  intersectsDay,
  limaDate,
} from '../domain/agenda';
import {
  minutesInDay,
  positionAppointments,
  positionByProfessional,
  timeMinutes,
} from '../domain/calendar-layout';
import { ReportResource } from '../../dashboard/application/report-resource';
import { addDays, limaToday } from '../../dashboard/domain/periods';
import { localDateTime } from '../../dashboard/domain/analytics';
import { Alert } from '../../../shared/ui/alert';
import { Icon } from '../../../shared/ui/icon';
import { AgendaFeedback } from './agenda-feedback';
import { AgendaIntent } from '../application/agenda-intent';
import { DayScheduleDialog, DayScheduleDialogData, DayScheduleResult } from './day-schedule-dialog';
import type { EventDialogData, EventDialog as EventDialogComponent } from './event-dialog';
import type { EventPreview as EventPreviewComponent } from './event-preview';
interface CalendarData {
  appointments: Appointment[];
  blocks: Block[];
  schedules: Schedule[];
}
interface CalendarWindow extends DayInterval {
  ownerId?: number;
  left?: number;
  width?: number;
}

@Component({
  selector: 'bm-calendar-page',
  imports: [DateField, ReactiveFormsModule, RouterLink, Alert, Icon, AgendaFeedback, MatMenuModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './calendar-page.html',
  styleUrl: './calendar-page.scss',
})
export class CalendarPage {
  readonly readOnly = input(false);
  readonly excludedProfessional = input<number | null>(null);
  readonly compactCalendar = toSignal(
    inject(BreakpointObserver)
      .observe(
        '(max-width: 600px), (max-width: 960px) and (max-height: 500px) and (pointer: coarse)',
      )
      .pipe(map((value) => value.matches)),
    { initialValue: false },
  );
  readonly focusDate = signal(limaToday());
  readonly displayedDays = computed(() =>
    this.compactCalendar() && this.view() === 'week' ? [this.focusDate()] : this.days(),
  );
  readonly personalProfessional = input<Professional | null>(null);
  readonly personalMode = input(false);
  readonly personalLoading = input(false);
  readonly personalCalendar = computed(() => this.personalMode() || !!this.personalProfessional());
  readonly intent = inject(AgendaIntent);
  readonly session = inject(SessionStore);
  readonly ownAgenda = computed(
    () =>
      this.personalCalendar() ||
      (!this.session.hasPermission('agenda.view_agenda') &&
        this.session.hasPermission('agenda.view_own_agenda')),
  );
  readonly canEditSchedules = computed(
    () =>
      !this.personalLoading() &&
      !this.readOnly() &&
      this.personalProfessional()?.activa !== false &&
      (this.session.hasPermission('agenda.manage_schedules') ||
        this.session.hasPermission('agenda.manage_own_schedule')),
  );
  readonly api = inject(AgendaApi);
  private readonly dialog = inject(MatDialog);
  readonly states = APPOINTMENT_STATES;
  readonly localDateTime = localDateTime;
  readonly error = signal<string | null>(null);
  readonly saved = signal('');
  readonly selection = signal<{ day: string; start: number; end: number } | null>(null);
  private drag: {
    day: string;
    minute: number;
    y: number;
    top: number;
    pointer: number;
    moved: boolean;
  } | null = null;
  private suppressClick = false;
  readonly days = signal<string[]>([]);
  readonly view = signal<CalendarView>('day');
  readonly professionalId = signal<number | null>(null);
  readonly layer = signal<'all' | 'availability' | 'confirmed' | 'blocks'>('all');
  readonly now = signal(new Date());
  readonly todayDate = limaToday();
  readonly scale = 1.6;
  readonly form = inject(FormBuilder).nonNullable.group({
    view: 'day' as CalendarView,
    date: limaToday(),
    state: '',
    professional: '',
  });
  readonly professionals = new ReportResource<Professional[]>((query) =>
    this.api.all<Professional>('profesionales/', query),
  );
  readonly daily = new ReportResource<DailySchedule[]>((query) =>
    this.api.all<DailySchedule>('disponibilidad-diaria/', query),
  );
  readonly resource = new ReportResource<CalendarData>((query) => {
    const filter = { ...query };
    delete filter['estado'];
    return forkJoin({
      appointments: this.api.calendar(query, null),
      blocks: this.api.all<Block>('bloqueos/', filter),
      schedules:
        this.ownAgenda() || query['profesional_id']
          ? this.api.all<Schedule>(
              'horarios/',
              query['profesional_id'] ? { profesional_id: query['profesional_id'] } : {},
            )
          : of([] as Schedule[]),
    });
  });
  readonly count = computed(() => this.resource.data()?.appointments.length ?? 0);
  readonly bounds = computed(() => {
    const values = [540, 1200];
    for (const row of this.resource.data()?.schedules ?? [])
      values.push(timeMinutes(row.hora_inicio), timeMinutes(row.hora_fin));
    for (const row of this.daily.data() ?? [])
      for (const interval of row.franjas)
        values.push(timeMinutes(interval.inicio), timeMinutes(interval.fin));
    for (const day of this.days())
      for (const row of [
        ...(this.resource.data()?.appointments ?? []),
        ...(this.resource.data()?.blocks ?? []),
      ].filter((row) => intersectsDay(row, day)))
        values.push(minutesInDay(row.inicio_en, day), minutesInDay(row.fin_en, day));
    return {
      start: Math.floor(Math.min(...values) / 60) * 60,
      end: Math.ceil(Math.max(...values) / 60) * 60,
    };
  });
  readonly hours = computed(() =>
    Array.from(
      { length: (this.bounds().end - this.bounds().start) / 60 },
      (_, index) => this.bounds().start + index * 60,
    ),
  );
  readonly slots = computed(() =>
    Array.from(
      { length: (this.bounds().end - this.bounds().start) / 30 },
      (_, index) => this.bounds().start + index * 30,
    ),
  );
  readonly gridHeight = computed(() => (this.bounds().end - this.bounds().start) * this.scale);
  readonly professionalIds = computed(() => {
    const ids = [
      ...new Set([
        ...(this.professionals.data() ?? []).filter((row) => row.activa).map((row) => row.id),
        ...(this.resource.data()?.appointments ?? []).map((row) => row.profesional_id),
      ]),
    ];
    return this.professionalId() === null ? ids : ids.filter((id) => id === this.professionalId());
  });
  readonly groupedByProfessional = computed(
    () => !this.compactCalendar() && this.view() === 'day' && this.professionalIds().length > 0,
  );
  readonly dayHeadings = computed(() =>
    !this.days().length
      ? []
      : this.groupedByProfessional()
        ? this.professionalIds().map((id) => ({
            day: this.days()[0],
            professionalId: id as number | null,
          }))
        : this.displayedDays().map((day) => ({ day, professionalId: null as number | null })),
  );
  readonly columns = computed(
    () =>
      (this.compactCalendar() ? '52px repeat(' : '80px repeat(') +
      this.dayHeadings().length +
      ', minmax(' +
      (this.compactCalendar() ? '0' : this.view() === 'day' ? '240px' : '360px') +
      ', 1fr))',
  );
  readonly rangeTitle = computed(() => {
    const days = this.days();
    if (!days.length) return '';
    const format = (value: string, options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', ...options }).format(
        new Date(value + 'T12:00:00-05:00'),
      );
    if (this.view() === 'month')
      return format(this.form.controls.date.value, { month: 'long', year: 'numeric' });
    if (days.length === 1)
      return format(days[0], { day: 'numeric', month: 'long', year: 'numeric' });
    return (
      format(days[0], { day: 'numeric', month: 'short' }) +
      ' — ' +
      format(days.at(-1)!, { day: 'numeric', month: 'short', year: 'numeric' })
    );
  });
  readonly confirmedCount = computed(
    () =>
      this.resource.data()?.appointments.filter((row) => row.estado === 'CONFIRMADA').length ?? 0,
  );
  readonly activeCount = computed(
    () =>
      this.resource
        .data()
        ?.appointments.filter(
          (row) => !['CANCELADA', 'EXPIRADA', 'NO_ASISTIO', 'COMPLETADA'].includes(row.estado),
        ).length ?? 0,
  );
  readonly currentDay = computed(() => limaDate(this.now().toISOString()));
  readonly currentMinute = computed(() => timeMinutes(this.time(this.now().toISOString())));
  readonly durationSummary = computed(() => {
    const minutes = this.days().reduce(
      (sum, day) =>
        sum +
        this.scheduleWindows(day)
          .filter((row) => !row.ocupado)
          .reduce(
            (value, interval) => value + timeMinutes(interval.fin) - timeMinutes(interval.inicio),
            0,
          ),
      0,
    );
    return new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 }).format(minutes / 60);
  });
  constructor() {
    const query = inject(ActivatedRoute).snapshot.queryParamMap;
    if (/^[1-9]\d*$/.test(query.get('profesional_id') ?? '') && !this.ownAgenda())
      this.form.controls.professional.setValue(query.get('profesional_id')!);
    effect(() => {
      const personal = this.personalProfessional();
      const personalMode = this.personalCalendar();
      const excluded = this.excludedProfessional();
      untracked(() => {
        if (personal) {
          this.professionals.data.set([personal]);
          this.form.controls.professional.setValue(String(personal.id));
        } else if (personalMode) this.professionals.data.set([]);
        else {
          if (excluded) this.form.controls.professional.setValue('');
          this.professionals.load(excluded ? { excluir_profesional_id: excluded } : {});
        }
        this.selection.set(null);
        this.load();
      });
    });
    const timer = setInterval(() => this.now.set(new Date()), 60000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
  load() {
    this.error.set(null);
    try {
      const value = this.form.getRawValue();
      this.focusDate.set(value.date);
      const professional =
        this.personalProfessional()?.id ?? (value.professional ? Number(value.professional) : null);
      this.professionalId.set(professional);
      const days = calendarDays(value.date, value.view);
      this.days.set(days);
      this.view.set(value.view);
      if (this.personalCalendar() && !this.personalProfessional()) {
        this.professionalId.set(null);
        this.resource.data.set({ appointments: [], blocks: [], schedules: [] });
        this.daily.data.set([]);
        return;
      }
      const range = {
        desde: days[0],
        hasta: addDays(days.at(-1)!, 1),
        ...(this.excludedProfessional()
          ? { excluir_profesional_id: this.excludedProfessional()! }
          : {}),
      };
      this.resource.load({
        ...range,
        ...(professional ? { profesional_id: professional } : {}),
        ...(value.state ? { estado: value.state } : {}),
      });
      this.daily.load({
        ...range,
        ...(this.personalProfessional() ? { profesional_id: professional! } : {}),
      });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Fecha inválida.');
    }
  }
  move(direction: number) {
    try {
      const value = this.form.getRawValue();
      if (value.view === 'month') {
        const date = new Date(value.date.slice(0, 7) + '-01T12:00:00Z');
        date.setUTCMonth(date.getUTCMonth() + direction);
        this.form.controls.date.setValue(date.toISOString().slice(0, 10));
      } else
        this.form.controls.date.setValue(
          addDays(value.date, direction * (value.view === 'week' ? 7 : 1)),
        );
      this.load();
    } catch {
      this.error.set('Selecciona una fecha válida.');
    }
  }
  today() {
    this.form.controls.date.setValue(limaToday());
    this.load();
  }
  selectMobileDay(day: string) {
    this.form.controls.date.setValue(day);
    this.focusDate.set(day);
  }
  openDay(day: string) {
    this.form.controls.date.setValue(day);
    this.form.controls.view.setValue('day');
    this.load();
  }
  selectDate(day: string) {
    this.form.controls.date.setValue(day);
    this.load();
  }
  monthName(day: string) {
    return new Intl.DateTimeFormat('es-PE', { month: 'short', timeZone: 'UTC' }).format(
      new Date(day + 'T12:00:00Z'),
    );
  }
  setView(view: CalendarView) {
    this.form.controls.view.setValue(view);
    this.load();
  }
  visibleAppointments(rows: Appointment[]) {
    return this.layer() === 'all'
      ? rows
      : this.layer() === 'confirmed'
        ? rows.filter((row) => row.estado === 'CONFIRMADA')
        : [];
  }
  intervalDuration(row: DayInterval) {
    const minutes = timeMinutes(row.fin) - timeMinutes(row.inicio);
    return (
      (minutes >= 60 ? Math.floor(minutes / 60) + ' h' : '') +
      (minutes % 60 ? ' ' + (minutes % 60) + ' min' : '')
    );
  }
  async createEvent(
    day = this.form.controls.date.value,
    minute = 540,
    appointment?: AppointmentDetail,
  ) {
    if (this.personalLoading() || this.readOnly()) return;
    if (this.personalCalendar() && !this.personalProfessional()) {
      return;
    }
    if (!this.session.hasPermission('agenda.manage_appointments') || this.intent.busy()) return;
    if (this.intent.pending()) {
      this.error.set('Resuelve la operación pendiente antes de abrir otra cita.');
      return;
    }
    this.saved.set('');
    if (!this.professionals.data())
      this.professionals.data.set(
        await firstValueFrom(this.api.all<Professional>('profesionales/')),
      );
    const { EventDialog } = await import('./event-dialog');
    const result = await firstValueFrom(
      this.dialog
        .open<EventDialogComponent, EventDialogData, { cita_id?: number }>(EventDialog, {
          width: '660px',
          maxWidth: '96vw',
          maxHeight: '96dvh',
          autoFocus: 'first-heading',
          data: {
            date: day < limaToday() ? limaToday() : day,
            time: this.minuteLabel(minute),
            professionalId: appointment
              ? String(appointment.profesional_id)
              : this.form.controls.professional.value,
            professionals: this.professionals.data() ?? [],
            appointment,
          },
        })
        .afterClosed(),
    );
    if (result?.cita_id) {
      this.layer.set('all');
      this.saved.set(
        appointment ? 'El horario de la cita se actualizó.' : 'La cita se guardó en tu calendario.',
      );
      this.load();
    }
  }
  async previewEvent(event: Event, appointment: Appointment) {
    if (
      !this.readOnly() &&
      event instanceof MouseEvent &&
      (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
    )
      return;
    event.preventDefault();
    const { EventPreview } = await import('./event-preview');
    const result = await firstValueFrom(
      this.dialog
        .open<EventPreviewComponent, unknown, AppointmentDetail>(EventPreview, {
          width: '510px',
          maxWidth: '96vw',
          autoFocus: 'first-heading',
          data: {
            id: appointment.id,
            professionalName: this.professionalName(appointment.profesional_id),
            status: this.status(appointment.estado),
            readOnly: this.readOnly(),
          },
        })
        .afterClosed(),
    );
    if (result)
      await this.createEvent(
        limaDate(result.inicio_en),
        timeMinutes(this.time(result.inicio_en)),
        result,
      );
  }
  slotClick(day: string, minute: number) {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    void this.configureDay(day, {
      inicio: this.minuteLabel(minute),
      fin: this.minuteLabel(Math.min(minute + 30, 1439)),
    });
  }
  beginSelection(event: PointerEvent, day: string, minute: number) {
    if (!this.canEditSchedules()) return;
    if (event.pointerType === 'touch' || event.button !== 0) return;
    const button = event.currentTarget as HTMLButtonElement;
    const column = button.closest('.day-column')!;
    this.drag = {
      day,
      minute,
      y: event.clientY,
      top: column.getBoundingClientRect().top,
      pointer: event.pointerId,
      moved: false,
    };
    button.setPointerCapture(event.pointerId);
  }
  moveSelection(event: PointerEvent) {
    const drag = this.drag;
    if (!drag || drag.pointer !== event.pointerId || Math.abs(event.clientY - drag.y) < 6) return;
    drag.moved = true;
    const minute = Math.max(
      this.bounds().start,
      Math.min(
        this.bounds().end - 15,
        Math.floor(((event.clientY - drag.top) / this.scale + this.bounds().start) / 15) * 15,
      ),
    );
    this.selection.set({
      day: drag.day,
      start: Math.min(drag.minute, minute),
      end: Math.max(drag.minute + 30, minute + 15),
    });
  }
  endSelection(event: PointerEvent) {
    const drag = this.drag;
    if (!drag || drag.pointer !== event.pointerId) return;
    const selection = this.selection();
    this.drag = null;
    this.selection.set(null);
    if (drag.moved && selection) {
      this.suppressClick = true;
      void this.configureDay(selection.day, {
        inicio: this.minuteLabel(selection.start),
        fin: this.minuteLabel(Math.min(selection.end, 1439)),
      });
    }
  }
  cancelSelection() {
    this.drag = null;
    this.selection.set(null);
    this.suppressClick = false;
  }
  minuteLabel(value: number) {
    return (
      Math.floor(value / 60)
        .toString()
        .padStart(2, '0') +
      ':' +
      (value % 60).toString().padStart(2, '0')
    );
  }
  pastSlot(day: string, minute: number) {
    return Date.parse(day + 'T' + this.minuteLabel(minute) + ':00-05:00') <= Date.now();
  }
  firstSlot(day: string) {
    return this.slots().find((minute) => !this.pastSlot(day, minute));
  }
  slotKey(event: KeyboardEvent) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = event.currentTarget as HTMLButtonElement;
    const slots = Array.from(
      current
        .closest('.day-column')!
        .querySelectorAll<HTMLButtonElement>('.time-slot:not(:disabled)'),
    );
    const index = slots.indexOf(current);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? slots.length - 1
          : Math.max(0, Math.min(slots.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
    slots[next]?.focus();
  }
  async configureDay(
    day = this.form.controls.date.value,
    selection?: DayInterval,
    scheduleOwner?: number,
  ) {
    if (this.personalLoading()) return;
    if (this.personalCalendar() && !this.personalProfessional()) {
      return;
    }
    if (!this.canEditSchedules()) return;
    const owner = this.ownAgenda()
      ? this.professionals.data()?.[0]?.id
      : (scheduleOwner ?? this.professionalId());
    if (!owner && this.professionals.data()?.some((row) => row.publicacion_propia)) {
      this.error.set('Selecciona una especialista para publicar o editar sus horas de cita.');
      return;
    }
    if (this.ownAgenda() && !owner) {
      this.error.set('Espera a que termine de cargar tu ficha de especialista.');
      return;
    }
    if (this.intent.pending()) {
      this.error.set('Resuelve la operación pendiente antes de cambiar una jornada.');
      return;
    }
    const result = await firstValueFrom(
      this.dialog
        .open<DayScheduleDialog, DayScheduleDialogData, DayScheduleResult>(DayScheduleDialog, {
          width: '640px',
          maxWidth: '96vw',
          data: {
            date: day,
            selection,
            professionalId: owner,
            professionalName: owner ? this.professionalName(owner) : undefined,
          },
        })
        .afterClosed(),
    );
    if (result) {
      this.layer.set('all');
      this.form.patchValue({ date: result.date });
      this.saved.set('Tu disponibilidad se guardó en el calendario.');
      this.load();
    }
  }
  async expire() {
    if (this.readOnly()) return;
    if (await this.intent.send(this.api.path('citas/expirar/'), {})) this.load();
  }
  professionalName(id: number) {
    const row = this.professionals.data()?.find((item) => item.id === id);
    return row ? row.nombres + ' ' + row.apellidos : 'Profesional #' + id;
  }
  professionalColor(id: number) {
    const index = Math.max(
      0,
      (this.professionals.data() ?? []).findIndex((row) => row.id === id),
    );
    return ['var(--forest)', 'var(--secondary)', 'var(--tertiary)', 'var(--primary-container)'][
      index % 4
    ];
  }
  professionalCount(id: number, day: string) {
    return this.dayAppointments(day, this.resource.data()?.appointments ?? []).filter(
      (row) => row.profesional_id === id,
    ).length;
  }
  dayAppointments(day: string, rows: Appointment[]) {
    return this.visibleAppointments(rows).filter((row) => intersectsDay(row, day));
  }
  dayBlocks(day: string, rows: Block[]) {
    return this.layer() === 'all' || this.layer() === 'blocks'
      ? rows.filter((row) => intersectsDay(row, day))
      : [];
  }
  events(day: string, rows: Appointment[]) {
    return this.groupedByProfessional()
      ? positionByProfessional(this.visibleAppointments(rows), day, this.professionalIds())
      : positionAppointments(this.visibleAppointments(rows), day);
  }
  displayedHours(day: string) {
    return this.layer() === 'all' || this.layer() === 'availability'
      ? this.scheduleWindows(day).filter((interval) => !interval.ocupado)
      : [];
  }
  scheduleWindows(day: string): CalendarWindow[] {
    if (this.professionals.data()?.some((row) => row.publicacion_propia)) {
      return this.professionalIds().flatMap((id, index) =>
        this.workingHours(day, id).map((interval) => ({
          ...interval,
          ownerId: id,
          left: (index * 100) / this.professionalIds().length,
          width: 100 / this.professionalIds().length,
        })),
      );
    }
    return this.workingHours(day);
  }
  workingHours(day: string, requestedOwner?: number): DayInterval[] {
    if (this.daily.error() || this.daily.loading()) return [];
    const owner =
      requestedOwner ??
      this.professionalId() ??
      (this.ownAgenda() ? this.professionals.data()?.[0]?.id : null);
    const own = this.daily.data()?.find((row) => row.fecha === day && row.profesional_id === owner);
    if (own) return own.franjas;
    if (owner && this.professionals.data()?.find((row) => row.id === owner)?.publicacion_propia)
      return [];
    const shared = this.daily
      .data()
      ?.find((row) => row.fecha === day && row.profesional_id === null);
    if (shared) return shared.franjas;
    const weekday = new Date(day + 'T12:00:00Z').getUTCDay() || 7;
    return (this.resource.data()?.schedules ?? [])
      .filter((row) => row.dia_semana === weekday)
      .map((row) => ({ inicio: row.hora_inicio.slice(0, 5), fin: row.hora_fin.slice(0, 5) }));
  }
  availabilityCount() {
    return this.days().reduce(
      (count, day) => count + this.scheduleWindows(day).filter((row) => !row.ocupado).length,
      0,
    );
  }
  hasOverride(day: string) {
    return (
      this.daily.data()?.some((row) => row.fecha === day && row.profesional_id === null) ?? false
    );
  }
  top(minute: number) {
    return (minute - this.bounds().start) * this.scale;
  }
  intervalTop(interval: DayInterval) {
    return this.top(timeMinutes(interval.inicio));
  }
  intervalHeight(interval: DayInterval) {
    return (timeMinutes(interval.fin) - timeMinutes(interval.inicio)) * this.scale;
  }
  blockTop(row: Block, day: string) {
    return this.top(minutesInDay(row.inicio_en, day));
  }
  blockHeight(row: Block, day: string) {
    return Math.max(
      18,
      (minutesInDay(row.fin_en, day) - minutesInDay(row.inicio_en, day)) * this.scale,
    );
  }
  hourLabel(value: number) {
    return (
      Math.floor(value / 60)
        .toString()
        .padStart(2, '0') + ':00'
    );
  }
  time(value: string) {
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(value));
  }
  weekday(day: string) {
    return new Intl.DateTimeFormat('es-PE', { weekday: 'short', timeZone: 'America/Lima' }).format(
      new Date(day + 'T12:00:00-05:00'),
    );
  }
  dayNumber(day: string) {
    return Number(day.slice(8));
  }
  status(value: string) {
    return (
      (
        {
          PROGRAMADA: 'Programada',
          CONFIRMADA: 'Confirmada',
          COMPLETADA: 'Atendida',
          CANCELADA: 'Cancelada',
          NO_ASISTIO: 'No asistió',
          EXPIRADA: 'Vencida',
          PENDIENTE_PAGO: 'Pendiente de anticipo',
        } as Record<string, string>
      )[value] ?? value
    );
  }
}
