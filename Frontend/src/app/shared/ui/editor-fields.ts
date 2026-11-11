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
    if (field.max) validators.push(Validators.maxLength(field.max));
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
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="form-grid" [formGroup]="form()">
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
              rows="4"
              [attr.maxlength]="field.max ?? null"
            ></textarea>
          } @else {
            <input
              [id]="prefix() + field.key"
              [type]="
                field.type === 'date' || field.type === 'datetime-local'
                  ? field.type
                  : field.type === 'email'
                    ? 'email'
                    : 'text'
              "
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
        @if (form().controls[field.key].invalid && form().controls[field.key].touched) {
          <p class="field-error" role="alert">
            {{
              form().controls[field.key].hasError('required')
                ? 'Este campo es obligatorio.'
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
    }
  </div>`,
})
export class EditorFields {
  readonly fields = input.required<readonly Field[]>();
  readonly form = input.required<FormRecord<FormControl<Value>>>();
  readonly prefix = input('field-');
  readonly errors = input<Readonly<Record<string, readonly string[]>>>({});
}
