import { DateField } from './date-field';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  FormControl,
  FormRecord,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Field, Value, decimalValid } from '../domain/records';
export function buildFields(
  fields: readonly Field[],
  initial: Readonly<Record<string, unknown>> = {},
) {
  const form = new FormRecord<FormControl<Value>>({});
  for (const field of fields) {
    const validators: ValidatorFn[] = [];
    if (field.required) validators.push(Validators.required);
    if (field.required && field.type !== 'checkbox')
      validators.push((control) =>
        String(control.value ?? '').trim() ? null : { required: true },
      );
    const min = field.min ?? (field.key === 'descripcion' ? 10 : undefined);
    const max = field.max ?? (field.type === 'textarea' ? 2000 : undefined);
    if (min)
      validators.push((control) =>
        !control.value || String(control.value).trim().length >= min
          ? null
          : { minlength: { requiredLength: min } },
      );
    if (max) validators.push(Validators.maxLength(max));
    if (field.type === 'email') validators.push(Validators.email);
    if (field.type === 'decimal')
      validators.push((control) =>
        decimalValid(control.value, field.scale ?? 2, field.scale === 3 ? 11 : 10)
          ? null
          : { decimal: true },
      );
    const value = initial[field.key];
    form.addControl(
      field.key,
      new FormControl<Value>(
        field.type === 'checkbox'
          ? value === true
          : value === null || value === undefined
            ? ''
            : String(value),
        { nonNullable: true, validators },
      ),
    );
  }
  return form;
}
@Component({
  selector: 'bm-editor-fields',
  imports: [ReactiveFormsModule, DateField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="form-grid" [class.compact]="compact()" [formGroup]="form()">
    @for (field of fields(); track field.key) {
      <div class="form-field" [class.wide]="field.type === 'textarea'">
        @if (field.type === 'checkbox') {
          <label class="check"
            ><input type="checkbox" [id]="prefix() + field.key" [formControlName]="field.key" />{{
              field.label
            }}</label
          >
        } @else {
          <label [for]="prefix() + field.key"
            >{{ field.label }}{{ field.required ? ' *' : '' }}</label
          >
          @if (field.type === 'select') {
            <select [id]="prefix() + field.key" [formControlName]="field.key">
              <option value="">Seleccionar</option>
              @for (option of field.options ?? []; track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
          } @else if (field.type === 'textarea') {
            <textarea
              [id]="prefix() + field.key"
              [formControlName]="field.key"
              [rows]="compact() ? 3 : 4"
              [attr.maxlength]="field.max ?? 2000"
              [attr.minlength]="field.min ?? (field.key === 'descripcion' ? 10 : null)"
              [attr.aria-invalid]="
                form().controls[field.key].invalid && form().controls[field.key].touched
                  ? 'true'
                  : null
              "
            ></textarea>
          } @else if (field.type === 'date' || field.type === 'datetime-local') {
            <bm-date-field
              [inputId]="prefix() + field.key"
              [ariaLabel]="field.label"
              [formControlName]="field.key"
              [readOnly]="field.readonly ?? false"
              [includeTime]="field.type === 'datetime-local'"
            />
          } @else {
            <input
              [id]="prefix() + field.key"
              [type]="field.type === 'email' ? 'email' : 'text'"
              [formControlName]="field.key"
              [readOnly]="field.readonly ?? false"
              [attr.inputmode]="field.type === 'decimal' ? 'decimal' : null"
              [attr.maxlength]="field.max ?? null"
            />
          }
        }
        @if (field.hint) {
          <small>{{ field.hint }}</small>
        }
        @if (field.type === 'textarea') {
          <small class="character-limit"
            >{{ textLength(field.key) }} / {{ field.max ?? 2000 }} caracteres
            @if (field.min || field.key === 'descripcion') {
              · Mínimo {{ field.min ?? 10 }}
            }
          </small>
        }
        <div
          class="field-feedback"
          [attr.tabindex]="hasFeedback(field.key) ? 0 : null"
          [attr.role]="hasFeedback(field.key) ? 'region' : null"
          [attr.aria-label]="hasFeedback(field.key) ? 'Avisos de ' + field.label : null"
        >
          @if (form().controls[field.key].invalid && form().controls[field.key].touched) {
            <p class="field-error" role="alert">
              {{
                form().controls[field.key].hasError('required')
                  ? 'Este campo es obligatorio.'
                  : form().controls[field.key].hasError('minlength')
                    ? 'Escribe al menos ' +
                      form().controls[field.key].getError('minlength').requiredLength +
                      ' caracteres.'
                    : form().controls[field.key].hasError('decimal')
                      ? 'Usa un decimal positivo o cero con punto y la precisión indicada.'
                      : 'Revisa el formato o la longitud de este campo.'
              }}
            </p>
          }
          @for (error of errors()[field.key] ?? []; track $index) {
            <p class="field-error" role="alert">{{ error }}</p>
          }
        </div>
      </div>
    }
  </div>`,
  styles: `
    .form-grid.compact {
      gap: 12px 16px;
    }
    .compact .form-field {
      display: grid;
      align-content: start;
      gap: 5px;
    }
    .compact label {
      margin: 0;
      font-size: 12px;
    }
    .compact input:not([type='checkbox']),
    .compact select,
    .compact textarea {
      min-height: 44px;
      padding: 10px 12px;
      font-size: 13px;
    }
    .compact small {
      margin: 0;
      font-size: 11px;
      line-height: 1.5;
    }
    .compact textarea {
      min-height: var(--editor-textarea-min-height, 44px);
      max-height: var(--editor-textarea-max-height, none);
      resize: vertical;
      overflow-y: auto;
    }
    .compact .field-feedback {
      block-size: auto;
      min-block-size: 0;
      margin: 0;
      overflow: visible;
    }
    .compact .field-feedback:not(:has(.field-error)) {
      display: none;
    }
    @media (max-width: 600px) {
      .form-grid.compact {
        grid-template-columns: 1fr;
        gap: 12px;
      }
    }
  `,
})
export class EditorFields {
  readonly compact = input(false);
  hasFeedback(key: string) {
    const control = this.form().controls[key];
    return (control.invalid && control.touched) || !!this.errors()[key]?.length;
  }
  textLength(key: string) {
    return String(this.form().controls[key].value ?? '').length;
  }
  readonly fields = input.required<readonly Field[]>();
  readonly form = input.required<FormRecord<FormControl<Value>>>();
  readonly prefix = input('field-');
  readonly errors = input<Readonly<Record<string, readonly string[]>>>({});
}
