import { ChangeDetectionStrategy, Component, effect, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { EMPTY, forkJoin, map, of, switchMap, throwError } from 'rxjs';
import { SessionStore } from '../../../core/auth/application/session-store';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AgendaApi } from '../infrastructure/agenda-api';
import { Availability, Professional, Slot } from '../domain/agenda';
import { ReportResource } from '../../dashboard/application/report-resource';
import { limaToday } from '../../dashboard/domain/periods';
import { localDateTime, money } from '../../dashboard/domain/analytics';
import { Alert } from '../../../shared/ui/alert';
@Component({
  selector: 'bm-slot-picker',
  imports: [ReactiveFormsModule, Alert],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="surface">
    <h2>Disponibilidad · hora de Lima</h2>
    <p>Los huecos son propuestas de Django. La reserva se valida nuevamente al guardar.</p>
    @if (professionals.error(); as error) {
      <bm-alert [message]="error" /><button type="button" (click)="professionals.retry()">
        Reintentar profesionales
      </button>
    }
    <form [formGroup]="form" (ngSubmit)="search()">
      <label
        >Profesional<select formControlName="professional" aria-label="Profesional">
          <option value="">Selecciona</option>
          @for (prof of professionals.data(); track prof.id) {
            <option [value]="prof.id">{{ prof.nombres }} {{ prof.apellidos }}</option>
          }
        </select></label
      ><label>Fecha disponible<input type="date" formControlName="date" /></label
      ><button
        type="submit"
        [disabled]="
          disabled() ||
          professionals.loading() ||
          availability.loading() ||
          !services().length ||
          form.invalid
        "
      >
        Consultar disponibilidad
      </button>
    </form>
    @if (availability.loading()) {
      <p role="status">Consultando disponibilidad real…</p>
    }
    @if (availability.error(); as error) {
      <bm-alert [message]="error" /><button type="button" (click)="search()">
        Reintentar disponibilidad
      </button>
    }
    @if (availability.data(); as available) {
      <p>
        Duración: {{ available.duracion_minutos }} minutos · Total:
        {{ money(available.precio_total) }} · Anticipo requerido:
        {{ money(available.anticipo_requerido) }}
      </p>
      <div class="agenda-options">
        @for (slot of available.slots; track slot.inicio_en) {
          <button
            type="button"
            [disabled]="disabled()"
            [attr.aria-pressed]="selected === slot.inicio_en"
            (click)="select(slot, available)"
          >
            {{ slotTime(slot.inicio_en) }} – {{ slotTime(slot.fin_en) }}
          </button>
        } @empty {
          <p>No hay horarios disponibles para esta selección.</p>
        }
      </div>
    }
  </section>`,
})
export class SlotPicker {
  readonly session = inject(SessionStore);
  slotTime(value: string) {
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(value));
  }
  readonly api = inject(AgendaApi);
  readonly services = input.required<number[]>();
  readonly disabled = input(false);
  readonly refresh = input(0);
  readonly date = input('');
  readonly preferredProfessional = input<number | null>(null);
  readonly picked = output<{ slot: Slot; availability: Availability } | null>();
  readonly money = money;
  readonly localDateTime = localDateTime;
  selected = '';
  readonly form = inject(FormBuilder).nonNullable.group({ professional: '', date: limaToday() });
  readonly professionals = new ReportResource<Professional[]>(() =>
    this.session.hasPermission('agenda.manage_professionals')
      ? this.api
          .all<Professional>('profesionales/', { activa: 'true' })
          .pipe(
            switchMap((rows) =>
              rows.length
                ? forkJoin(
                    rows.map((row) =>
                      this.api
                        .get<{ servicios: number[] }>(
                          'profesionales/' + row.id + '/especialidades/',
                        )
                        .pipe(map((s) => ({ row, services: s.servicios }))),
                    ),
                  ).pipe(
                    map((items) =>
                      items
                        .filter((item) => this.services().every((id) => item.services.includes(id)))
                        .map((item) => item.row),
                    ),
                  )
                : of([]),
            ),
          )
      : throwError(
          () =>
            new Error(
              'La selección de profesionales está bloqueada para este rol hasta que Django proteja sus comisiones.',
            ),
        ),
  );
  readonly availability = new ReportResource<Availability>((q) =>
    q['date']
      ? this.api.availability(
          String(q['date']),
          Number(q['professional']),
          String(q['services']).split(',').map(Number),
        )
      : EMPTY,
  );
  constructor() {
    effect(() => {
      this.services();
      this.refresh();
      this.date();
      this.preferredProfessional();
      this.reset();
      this.form.patchValue(
        {
          professional: this.preferredProfessional() ? String(this.preferredProfessional()) : '',
          date: this.date() || limaToday(),
        },
        { emitEvent: false },
      );
      this.professionals.load({});
    });
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.reset());
  }
  reset() {
    this.selected = '';
    this.picked.emit(null);
    this.availability.data.set(null);
    /* Cancel any obsolete request before it can publish slots. */ this.availability.load({
      date: '',
      professional: 0,
      services: '',
    });
  }
  search() {
    if (!this.session.hasPermission('agenda.manage_professionals')) return;
    this.selected = '';
    this.picked.emit(null);
    const { date, professional } = this.form.getRawValue();
    if (!date || !professional || !this.services().length) return;
    this.availability.load({ date, professional, services: this.services().join(',') });
  }
  select(slot: Slot, availability: Availability) {
    this.selected = slot.inicio_en;
    this.picked.emit({ slot, availability });
  }
}
