import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { AgendaApi } from '../../agenda/infrastructure/agenda-api';
import { Professional } from '../../agenda/domain/agenda';
import { ReportResource } from '../../dashboard/application/report-resource';
import { Icon } from '../../../shared/ui/icon';

@Component({
  selector: 'bm-treatment-staff-picker',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './treatment-staff-picker.scss',
  template: `<section class="staff-picker" aria-label="Personas que atienden el tratamiento">
    <div class="staff-heading">
      <span class="staff-icon"><bm-icon name="users" /></span>
      <div>
        <h3>¿Quién atiende este tratamiento?</h3>
        <p>Asigna una o varias personas. Al reservar, solo se ofrecerán las personas asignadas.</p>
      </div>
    </div>
    <label for="treatment-staff">Añadir persona</label>
    <select
      #person
      id="treatment-staff"
      [disabled]="busy() || rows.loading() || !available().length"
      (change)="add(person.value); person.value = ''"
    >
      <option value="">Seleccionar persona</option>
      @for (row of available(); track row.id) {
        <option [value]="row.id">{{ row.nombres }} {{ row.apellidos }}</option>
      }
    </select>
    <div
      class="field-feedback"
      [attr.tabindex]="rows.error() ? 0 : null"
      role="region"
      aria-label="Avisos de personas asignadas"
    >
      @if (rows.error()) {
        <p class="field-error" role="alert">
          No se pudo cargar las personas.
          <button type="button" (click)="rows.load({})">Reintentar</button>
        </p>
      }
    </div>
    @if (rows.loading()) {
      <p class="staff-hint" role="status">Cargando personas…</p>
    }
    <ul aria-label="Personas asignadas al tratamiento">
      @for (id of selected(); track id) {
        <li>
          <bm-icon name="users" /><span>{{ name(id) }}</span
          ><button
            type="button"
            [disabled]="busy()"
            [attr.aria-label]="'Quitar persona ' + name(id)"
            (click)="remove(id)"
          >
            <bm-icon name="close" />
          </button>
        </li>
      }
    </ul>
    @if (!selected().length && !rows.loading()) {
      <p class="staff-hint">
        Sin personas asignadas, este tratamiento no tendrá opciones de reserva.
      </p>
    }
  </section>`,
})
export class TreatmentStaffPicker {
  readonly selected = input<readonly number[]>([]);
  readonly busy = input(false);
  readonly changed = output<number[]>();
  private readonly api = inject(AgendaApi);
  readonly rows = new ReportResource<Professional[]>(() =>
    this.api.all<Professional>('profesionales/'),
  );
  readonly available = computed(() =>
    (this.rows.data() ?? []).filter((row) => row.activa && !this.selected().includes(row.id)),
  );
  constructor() {
    this.rows.load({});
  }
  name(id: number) {
    const row = this.rows.data()?.find((person) => person.id === id);
    return row
      ? row.nombres + ' ' + row.apellidos + (row.activa ? '' : ' · Inactiva')
      : 'Persona #' + id;
  }
  add(value: string) {
    const id = Number(value);
    if (
      !this.busy() &&
      this.available().some((row) => row.id === id) &&
      this.selected().length < 200
    )
      this.changed.emit([...this.selected(), id]);
  }
  remove(id: number) {
    if (!this.busy()) this.changed.emit(this.selected().filter((value) => value !== id));
  }
}
