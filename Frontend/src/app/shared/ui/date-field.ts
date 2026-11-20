import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  viewChild,
  forwardRef,
  effect,
  inject,
  Injectable,
  input,
  output,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
  NG_VALIDATORS,
  ValidationErrors,
  Validator,
} from '@angular/forms';
import {
  DateAdapter,
  MAT_DATE_FORMATS,
  MATERIAL_ANIMATIONS,
  MAT_DATE_LOCALE,
  NativeDateAdapter,
} from '@angular/material/core';
import { MatDatepicker, MatDatepickerModule } from '@angular/material/datepicker';
import { Icon } from './icon';

@Injectable()
class SharedDateAdapter extends NativeDateAdapter {
  monthOnly = false;
  override parse(value: unknown): Date | null {
    if (
      typeof value !== 'string' ||
      !(this.monthOnly ? /^\d{4}-\d{2}(?:-\d{2})?$/ : /^\d{4}-\d{2}-\d{2}$/).test(value)
    )
      return null;
    const [year, month, day = 1] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
      ? date
      : null;
  }
  override format(date: Date, displayFormat: object | string): string {
    return displayFormat === 'iso'
      ? isoDate(date).slice(0, this.monthOnly ? 7 : 10)
      : super.format(date, displayFormat as object);
  }
  override getDayOfWeekNames(style: 'long' | 'short' | 'narrow'): string[] {
    return style === 'narrow'
      ? ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'S\u00e1']
      : super.getDayOfWeekNames(style);
  }
  override getFirstDayOfWeek() {
    return 1;
  }
}
function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

let fieldSequence = 0;

@Component({
  selector: 'bm-date-field',
  imports: [MatDatepickerModule, Icon],
  providers: [
    { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateField), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => DateField), multi: true },
    { provide: MAT_DATE_LOCALE, useValue: 'es-PE' },
    { provide: DateAdapter, useClass: SharedDateAdapter },
    {
      provide: MAT_DATE_FORMATS,
      useValue: {
        parse: { dateInput: 'iso' },
        display: {
          dateInput: 'iso',
          monthYearLabel: { year: 'numeric', month: 'long' },
          dateA11yLabel: { year: 'numeric', month: 'long', day: 'numeric' },
          monthYearA11yLabel: { year: 'numeric', month: 'long' },
        },
      },
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="date-field" [class.inactive]="disabled() || readOnly()">
    @if (includeTime()) {
      <input
        #dateTimeInput
        type="text"
        [id]="inputId()"
        [attr.aria-label]="ariaLabel()"
        [value]="dateTimeValue()"
        [disabled]="disabled()"
        [readOnly]="readOnly()"
        placeholder="aaaa-mm-ddThh:mm"
        autocomplete="off"
        (input)="updateDateTime($any($event.target).value)"
        (blur)="touched()"
      />
      <input
        class="calendar-anchor"
        tabindex="-1"
        aria-hidden="true"
        [matDatepicker]="picker"
        [value]="value()"
        [min]="minimum()"
        [disabled]="disabled() || readOnly()"
        (dateChange)="choose($event.value)"
      />
    } @else {
      <input
        [id]="inputId()"
        [matDatepicker]="picker"
        [value]="value()"
        [min]="minimum()"
        [disabled]="disabled()"
        [readOnly]="readOnly()"
        [attr.aria-label]="ariaLabel()"
        [placeholder]="monthOnly() ? 'aaaa-mm' : 'aaaa-mm-dd'"
        autocomplete="off"
        (dateInput)="choose($event.value, $any($event.targetElement).value)"
        (blur)="touched()"
      />
    }
    <button
      class="date-trigger"
      type="button"
      [disabled]="disabled() || readOnly()"
      [attr.aria-label]="monthOnly() ? 'Elegir mes' : 'Abrir calendario'"
      [attr.title]="ariaLabel()"
      (click)="picker.open()"
    >
      <bm-icon name="calendar" />
    </button>
    <mat-datepicker
      #picker
      panelClass="agenda-date-panel"
      [startView]="monthOnly() ? 'year' : 'month'"
      [disabled]="disabled() || readOnly()"
      (monthSelected)="selectMonth($event, picker)"
      [restoreFocus]="!includeTime()"
      (closed)="restoreFocus()"
    />
  </div>`,
  styleUrl: './date-field.scss',
})
export class DateField implements ControlValueAccessor, Validator {
  readonly inputId = input('shared-date-' + ++fieldSequence);
  readonly includeTime = input(false);
  readonly dateTimeValue = signal('');
  readonly valueChanged = output<string>();
  private readonly dateTimeInput = viewChild<ElementRef<HTMLInputElement>>('dateTimeInput');
  restoreFocus() {
    this.dateTimeInput()?.nativeElement.focus();
  }
  updateDateTime(value: string) {
    if (this.readOnly() || this.disabled()) return;
    this.dateTimeValue.set(value);
    this.value.set(this.parse(value.slice(0, 10)));
    this.change(value);
    this.valueChanged.emit(value);
    this.touched();
  }
  validate(control: AbstractControl): ValidationErrors | null {
    const raw = control.value;
    if (raw === '' || raw == null) return null;
    if (typeof raw !== 'string') return { date: true };
    const datePart = this.includeTime() ? raw.slice(0, 10) : raw;
    if (!this.adapter.parse(datePart)) return { date: true };
    if (
      this.includeTime() &&
      (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) ||
        Number(raw.slice(11, 13)) > 23 ||
        Number(raw.slice(14, 16)) > 59)
    )
      return { dateTime: true };
    if (this.min() && datePart < this.min()) return { minDate: true };
    return null;
  }
  readonly monthOnly = input(false);
  private readonly adapter = inject(DateAdapter) as SharedDateAdapter;
  constructor() {
    effect(() => {
      this.adapter.monthOnly = this.monthOnly();
    });
  }
  selectMonth(date: Date, picker: MatDatepicker<Date>) {
    if (!this.monthOnly()) return;
    this.choose(new Date(date.getFullYear(), date.getMonth(), 1));
    picker.close();
  }
  readonly dateSelected = output<void>();
  readonly ariaLabel = input('Fecha');
  readonly min = input('');
  readonly readOnly = input(false);
  readonly disabled = signal(false);
  readonly value = signal<Date | null>(null);
  private change: (value: string) => void = () => {};
  touched: () => void = () => {};
  minimum() {
    return this.parse(this.min());
  }
  private parse(value: string) {
    return this.adapter.parse(value);
  }
  writeValue(value: string | null) {
    this.dateTimeValue.set(value ?? '');
    this.value.set(this.parse((value ?? '').slice(0, 10)));
  }
  registerOnChange(fn: (value: string) => void) {
    this.change = fn;
  }
  registerOnTouched(fn: () => void) {
    this.touched = fn;
  }
  setDisabledState(disabled: boolean) {
    this.disabled.set(disabled);
  }
  choose(date: Date | null, raw?: string) {
    if (this.readOnly() || this.disabled()) return;
    const valid = date && !isNaN(date.getTime());
    if (!valid && raw) {
      this.change(raw);
      this.touched();
      return;
    }
    this.value.set(date);
    const time = this.dateTimeValue().split('T')[1] || '09:00';
    const result = valid ? isoDate(date) + (this.includeTime() ? 'T' + time : '') : '';
    this.dateTimeValue.set(result);
    this.change(result);
    this.valueChanged.emit(result);
    this.touched();
    if (date && !isNaN(date.getTime())) this.dateSelected.emit();
  }
}
