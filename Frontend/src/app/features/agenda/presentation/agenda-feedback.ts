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
    @if (intent.notice(); as notice) {
      <bm-alert kind="info" [message]="notice" />
    }
    @if (intent.pending()) {
      <bm-alert
        kind="info"
        message="Hay un intento anterior pendiente. Resolverlo recupera lo que ya se guardó o cierra el intento si no realizó cambios."
      /><button type="button" [disabled]="intent.busy()" (click)="recover()">
        Consultar resultado de agenda</button
      ><button type="button" [disabled]="intent.busy()" (click)="resolve()">
        Resolver operación pendiente</button
      ><button type="button" [disabled]="intent.busy() || !intent.canRetry()" (click)="retry()">
        Reintentar operación pendiente
      </button>
    }`,
})
export class AgendaFeedback {
  async resolve() {
    const result = await this.intent.resolve();
    if (result) this.done.emit(result);
  }
  async recover() {
    const result = await this.intent.recover();
    if (result) this.done.emit(result);
  }
  readonly intent = inject(AgendaIntent);
  readonly done = output<MutationResult>();
  async retry() {
    const result = await this.intent.retry();
    if (result) this.done.emit(result);
  }
}
