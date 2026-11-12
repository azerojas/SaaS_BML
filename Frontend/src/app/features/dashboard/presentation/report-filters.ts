import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { AnalyticsFilters, Preset } from '../domain/analytics';
import { presetFilters, validateFilters } from '../domain/periods';
@Component({
  selector: 'bm-report-filters',
  imports: [ReactiveFormsModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<form class="surface report-filters" [formGroup]="form" (ngSubmit)="apply()">
    <fieldset [disabled]="disabled()">
      <legend>Período y agrupación</legend>
      <div class="report-filter-grid">
        <div>
          <label for="analytics-preset">Período</label
          ><select id="analytics-preset" formControlName="preset" (change)="preset()">
            <option value="day">Hoy</option>
            <option value="week">Semana actual</option>
            <option value="last7">Últimos 7 días</option>
            <option value="month">Mes actual hasta hoy</option>
            <option value="previousmonth">Mes anterior</option>
            <option value="custom">Rango personalizado</option>
          </select>
        </div>
        <label
          >Desde (Lima)<input
            type="date"
            formControlName="desde"
            [readOnly]="form.controls.preset.value !== 'custom'" /></label
        ><label
          >Hasta inclusive (Lima)<input
            type="date"
            formControlName="hasta"
            [readOnly]="form.controls.preset.value !== 'custom'"
        /></label>
        <div>
          <label for="analytics-granularity">Agrupar evolución</label
          ><select id="analytics-granularity" formControlName="granularidad">
            <option value="day">Por día</option>
            <option value="week">Por semana</option>
            <option value="month">Por mes</option>
          </select>
        </div>
        <button mat-flat-button type="submit">Aplicar período</button>
      </div>
      <p class="muted">
        America/Lima · PEN · Inicio y fin incluidos en pantalla. El servidor recibe el día siguiente
        como límite final exclusivo.
      </p>
      @if (error) {
        <p role="alert">{{ error }}</p>
      }
    </fieldset>
  </form>`,
})
export class ReportFilters {
  readonly disabled = input(false);
  readonly applied = output<AnalyticsFilters>();
  readonly form = inject(FormBuilder).nonNullable.group(presetFilters('day'));
  error: string | null = null;
  preset() {
    const key = this.form.controls.preset.value as Preset;
    if (key !== 'custom')
      this.form.patchValue({
        ...presetFilters(key),
        granularidad: this.form.controls.granularidad.value,
      });
  }
  apply() {
    if (this.disabled()) return;
    const value = this.form.getRawValue();
    this.error = validateFilters(value);
    if (!this.error) this.applied.emit(value);
  }
}
