import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { Alert } from '../../../shared/ui/alert';
import { AgendaIntent } from '../application/agenda-intent';
import { MutationResult } from '../domain/agenda';
import { ValidationSummary } from '../../../shared/ui/validation-summary';
@Component({
  selector: 'bm-agenda-feedback',
  imports: [Alert, ValidationSummary],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (intent.error(); as error) {
      <bm-alert [message]="error" />
    }
    <bm-validation-summary [errors]="intent.fields()" />
    @if (intent.pending()) {
      <bm-alert
        kind="info"
        message="Operación pendiente de respuesta. Conserva esta sesión. El reintento usa exactamente el mismo contenido y clave; después de recargar debes reenviar el formulario original."
      /><button type="button" [disabled]="intent.busy()" (click)="retry()">
        Reintentar operación pendiente
      </button>
    }`,
})
export class AgendaFeedback {
  readonly intent = inject(AgendaIntent);
  readonly done = output<MutationResult>();
  async retry() {
    const result = await this.intent.retry();
    if (result) this.done.emit(result);
  }
}
