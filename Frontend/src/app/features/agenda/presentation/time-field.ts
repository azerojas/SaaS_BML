import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  forwardRef,
  inject,
  Injector,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  MatAutocomplete,
  MatAutocompleteModule,
  MatAutocompleteTrigger,
} from '@angular/material/autocomplete';
import { Icon } from '../../../shared/ui/icon';

let fieldSequence = 0;
@Component({
  selector: 'bm-time-field',
  imports: [MatAutocompleteModule, Icon],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TimeField), multi: true },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<label [for]="id">{{ label() }}</label>
    <div class="time-control" [class.inactive]="disabled() || readOnly()">
      <bm-icon name="clock" />
      <input
        #timeInput
        [id]="id"
        type="text"
        inputmode="numeric"
        maxlength="5"
        placeholder="09:00"
        [attr.aria-label]="ariaLabel() || label()"
        [value]="value()"
        [disabled]="disabled()"
        [readOnly]="readOnly()"
        [matAutocomplete]="choices"
        [matAutocompleteDisabled]="!pickerOpen() || readOnly() || disabled()"
        (input)="update($any($event.target).value)"
        (blur)="normalize()"
        (keydown.arrowdown)="openPicker($event)"
      />
      <button
        type="button"
        [disabled]="disabled() || readOnly()"
        [attr.aria-label]="'Mostrar horas de ' + label()"
        (click)="openPicker()"
      >
        <bm-icon name="chevron" />
      </button>
    </div>
    <mat-autocomplete
      #choices="matAutocomplete"
      (opened)="scrollSelected()"
      (closed)="pickerOpen.set(false)"
      (optionSelected)="choose($event.option.value)"
    >
      @for (time of times; track time) {
        <mat-option [value]="time" [attr.data-time]="time"
          ><span class="time-option">{{ time }}</span></mat-option
        >
      }
    </mat-autocomplete>`,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    label {
      display: block;
      font-size: 11px;
      font-weight: 650;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .time-control {
      position: relative;
      min-height: 49px;
    }
    .time-control > bm-icon {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      width: 16px;
      height: 16px;
      color: var(--muted);
      pointer-events: none;
    }
    .time-control input {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      min-height: 49px;
      border: 1px solid var(--outline);
      border-radius: 9px;
      background: var(--paper);
      padding: 12px 44px 12px 38px;
      font: inherit;
      font-size: 16px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.03em;
      color: var(--ink);
      box-shadow: none;
    }
    .time-control input:focus {
      border-color: var(--forest);
      outline: 2px solid var(--forest);
      outline-offset: -2px;
      box-shadow: none;
    }
    .time-control button {
      position: absolute;
      right: 3px;
      top: 50%;
      transform: translateY(-50%);
      display: grid;
      place-items: center;
      flex-shrink: 0;
      min-width: 36px;
      min-height: 44px;
      border: 0;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      border-radius: 9px;
    }
    .time-control button bm-icon {
      width: 13px;
      height: 13px;
      transform: rotate(90deg);
    }
    .inactive {
      opacity: 0.7;
    }
    .time-option {
      font-variant-numeric: tabular-nums;
      font-size: 14px;
    }
    @media (max-width: 400px) {
      .time-control > bm-icon {
        display: none;
      }
      .time-control input {
        padding-left: 12px;
        font-size: 15px;
      }
    }
  `,
})
export class TimeField implements ControlValueAccessor {
  readonly label = input('Hora');
  readonly ariaLabel = input('');
  readonly readOnly = input(false);
  readonly value = signal('');
  readonly disabled = signal(false);
  readonly pickerOpen = signal(false);
  readonly id = 'agenda-time-' + ++fieldSequence;
  readonly times = Array.from(
    { length: 96 },
    (_, index) =>
      String(Math.floor(index / 4)).padStart(2, '0') +
      ':' +
      String((index % 4) * 15).padStart(2, '0'),
  );
  private readonly trigger = viewChild.required(MatAutocompleteTrigger);
  private readonly panel = viewChild.required(MatAutocomplete);
  private readonly nativeInput = viewChild.required<ElementRef<HTMLInputElement>>('timeInput');
  private readonly injector = inject(Injector);
  private readonly destroy = inject(DestroyRef);
  private changed: (value: string) => void = () => undefined;
  private touched: () => void = () => undefined;
  writeValue(value: string | null) {
    this.value.set(value ?? '');
  }
  registerOnChange(fn: (value: string) => void) {
    this.changed = fn;
  }
  registerOnTouched(fn: () => void) {
    this.touched = fn;
  }
  setDisabledState(value: boolean) {
    this.disabled.set(value);
  }
  update(value: string) {
    this.value.set(value);
    this.changed(value);
  }
  normalize() {
    let value = this.value().trim();
    if (/^\d{1,2}$/.test(value)) value = value.padStart(2, '0') + ':00';
    else if (/^\d{3,4}$/.test(value))
      value = value.slice(0, -2).padStart(2, '0') + ':' + value.slice(-2);
    else if (/^\d{1,2}:\d{2}$/.test(value)) value = value.padStart(5, '0');
    this.update(value);
    this.touched();
  }
  openPicker(event?: Event) {
    event?.preventDefault();
    if (this.disabled() || this.readOnly() || this.pickerOpen()) return;
    this.pickerOpen.set(true);
    afterNextRender(
      () => {
        if (!this.destroy.destroyed) {
          this.nativeInput().nativeElement.focus();
          this.trigger().openPanel();
        }
      },
      { injector: this.injector },
    );
  }
  choose(value: string) {
    this.update(value);
    this.touched();
    this.pickerOpen.set(false);
  }
  scrollSelected() {
    const panel = this.panel().panel?.nativeElement as HTMLElement | undefined;
    if (!panel) return;
    const selected = Array.from(panel.querySelectorAll<HTMLElement>('[data-time]')).find(
      (row) => row.dataset['time'] === this.value(),
    );
    if (selected) panel.scrollTop = Math.max(0, selected.offsetTop - panel.clientHeight / 2);
  }
}
