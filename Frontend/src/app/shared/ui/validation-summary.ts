import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
@Component({
  selector: 'bm-validation-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (entries().length) {
    <div class="field-error" role="alert">
      <p>Revisa los datos indicados por el servidor:</p>
      <ul>
        @for (entry of entries(); track entry[0]) {
          @for (message of entry[1]; track $index) {
            <li>{{ label(entry[0]) }}: {{ message }}</li>
          }
        }
      </ul>
    </div>
  }`,
})
export class ValidationSummary {
  readonly errors = input.required<Readonly<Record<string, readonly string[]>>>();
  readonly entries = computed(() =>
    Object.entries(this.errors()).filter(([, messages]) => messages.length),
  );
  label(key: string) {
    const parts = key.split('.');
    if (parts[0] === 'detalles' && /^\d+$/.test(parts[1] ?? ''))
      return 'Línea ' + (Number(parts[1]) + 1) + ' · ' + (parts[2] ?? 'datos').replaceAll('_', ' ');
    return key === 'non_field_errors'
      ? 'Validación general'
      : key === 'Idempotency-Key'
        ? 'Operación'
        : key.replaceAll('_', ' ');
  }
}
