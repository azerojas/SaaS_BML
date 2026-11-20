import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Icon } from './icon';

@Component({
  selector: 'bm-text-field',
  host: { '[attr.id]': 'null' },
  imports: [ReactiveFormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<label class="field-label" [for]="id()">{{ label() }}</label>
    <div class="input-wrap">
      <input
        class="field-input"
        [class.has-toggle]="type() === 'password'"
        [id]="id()"
        [type]="inputType()"
        [formControl]="control()"
        [autocomplete]="autocomplete()"
        [placeholder]="placeholder()"
        [attr.inputmode]="inputMode()"
        [attr.maxlength]="maxLength()"
        [attr.aria-label]="label()"
        [attr.aria-required]="isRequired()"
        [attr.aria-invalid]="showError() ? true : null"
        [attr.aria-describedby]="showError() ? id() + '-error' : null"
      />
      @if (type() === 'password') {
        <button
          class="password-toggle"
          type="button"
          [attr.aria-label]="visible() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
          [attr.aria-pressed]="visible()"
          (click)="visible.set(!visible())"
        >
          <bm-icon name="eye" />
        </button>
      }
    </div>
    @if (showError()) {
      <p class="field-error" [id]="id() + '-error'">
        @if (control().hasError('required')) {
          Este campo es obligatorio.
        } @else if (control().hasError('maxlength')) {
          El contenido es demasiado largo.
        } @else {
          Revisa el formato de este campo.
        }
      </p>
    } `,
  styles: `
    :host {
      display: block;
      margin-bottom: 1.3rem;
    }
    .field-label {
      display: block;
      font-size: 0.82rem;
      font-weight: 650;
      margin-bottom: 0.55rem;
      color: var(--ink);
    }
    .input-wrap {
      position: relative;
    }
    .field-input {
      display: block;
      width: 100%;
      min-height: 50px;
      box-sizing: border-box;
      border: 1px solid var(--outline);
      border-radius: 9px;
      padding: 12px 14px;
      background: var(--paper);
      color: var(--ink);
      font: inherit;
      font-size: 0.91rem;
      box-shadow: none;
    }
    .field-input.has-toggle {
      padding-right: 52px;
    }
    .field-input:focus {
      border-color: var(--forest);
      outline: 2px solid var(--forest);
      outline-offset: -2px;
      box-shadow: none;
    }
    .field-input[aria-invalid='true'] {
      border-color: var(--error);
    }
    .password-toggle {
      position: absolute;
      right: 7px;
      top: 50%;
      transform: translateY(-50%);
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      min-height: 36px;
      padding: 0;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
    }
    .password-toggle:hover {
      background: var(--surface-low);
    }
    .password-toggle:focus-visible {
      outline: 2px solid var(--forest);
      outline-offset: 0;
    }
    .field-error {
      color: var(--error);
      font-size: 0.75rem;
      line-height: 1.5;
      margin: 6px 0 0;
    }
  `,
})
export class TextField {
  constructor() {
    const changeDetector = inject(ChangeDetectorRef);
    effect((onCleanup) => {
      const subscription = this.control().events.subscribe(() => changeDetector.markForCheck());
      onCleanup(() => subscription.unsubscribe());
    });
  }
  showError() {
    return this.control().invalid && this.control().touched;
  }
  isRequired() {
    return this.control().hasValidator(Validators.required);
  }
  readonly control = input.required<FormControl<string>>();
  readonly id = input.required<string>();
  readonly label = input.required<string>();
  readonly type = input<'text' | 'password'>('text');
  readonly autocomplete = input('off');
  readonly placeholder = input('');
  readonly inputMode = input('text');
  readonly maxLength = input(150);
  readonly visible = signal(false);
  readonly inputType = computed(() =>
    this.type() === 'password' && !this.visible() ? 'password' : 'text',
  );
}
