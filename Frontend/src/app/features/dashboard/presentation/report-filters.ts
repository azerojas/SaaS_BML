import { untracked } from '@angular/core';
import { DateField } from '../../../shared/ui/date-field';
import { ChangeDetectionStrategy, Component, effect, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { AnalyticsFilters, Preset } from '../domain/analytics';
import { presetFilters, validateFilters } from '../domain/periods';
@Component({
  selector: 'bm-report-filters',
  imports: [DateField, ReactiveFormsModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<form class="surface report-filters" [formGroup]="form" (ngSubmit)="apply()">
    <fieldset [disabled]="disabled()">
      <legend>{{ showGrouping() ? 'Período y agrupación' : 'Período' }}</legend>
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
        <div class="calendar-field-label">
          <span>Desde (Lima)</span
          ><bm-date-field
            ariaLabel="Desde (Lima)"
            formControlName="desde"
            [readOnly]="form.controls.preset.value !== 'custom'"
          />
        </div>
        <div class="calendar-field-label">
          <span>Hasta inclusive (Lima)</span
          ><bm-date-field
            ariaLabel="Hasta inclusive (Lima)"
            formControlName="hasta"
            [readOnly]="form.controls.preset.value !== 'custom'"
          />
        </div>
        @if (showGrouping()) {
          <div>
            <label for="analytics-granularity">Agrupar evolución</label
            ><select id="analytics-granularity" formControlName="granularidad">
              <option value="day">Por día</option>
              <option value="week">Por semana</option>
              <option value="month">Por mes</option>
            </select>
          </div>
        }
        <button mat-flat-button type="submit">Aplicar período</button>
      </div>
      <ng-content select="[dashboard-controls]" />
      <ng-content select="[filter-summary]" />
      <p class="muted">
        Fechas de Lima · Moneda: soles (PEN).
      </p>
      @if (error) {
        <p role="alert">{{ error }}</p>
      }
    </fieldset>
  </form>`,
})
export class ReportFilters {
  readonly initialPreset = input<Preset>('day');
  readonly showGrouping = input(true);
  constructor() {
    effect(() => {
      const preset = this.initialPreset();
      untracked(() => this.form.patchValue(presetFilters(preset), { emitEvent: false }));
    });
  }
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
