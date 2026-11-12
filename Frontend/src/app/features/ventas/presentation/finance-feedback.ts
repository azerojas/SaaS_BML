import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { FinancialIntent } from '../application/financial-intent';
import { FinanceResult } from '../domain/sale';
import { Alert } from '../../../shared/ui/alert';
import { ValidationSummary } from '../../../shared/ui/validation-summary';
@Component({
  selector: 'bm-finance-feedback',
  imports: [MatButtonModule, Alert, ValidationSummary],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (intent.error(); as error) {
      <bm-alert [message]="error" />
    }
    <bm-validation-summary [errors]="intent.fields()" />
    @if (intent.uncertain()) {
      <section class="surface section-gap">
        <h2>Operación por comprobar</h2>
        <p>{{ intent.pendingLabel() }}</p>
        <p>
          Consulta el resultado en Django antes de reintentar. Se conserva la misma clave; nunca se
          reenvía un cobro automáticamente.
        </p>
        <div class="form-actions">
          <button mat-stroked-button [disabled]="intent.busy()" (click)="recover()">
            Consultar resultado de la operación
          </button>
          @if (intent.canRetry()) {
            <button mat-stroked-button [disabled]="intent.busy()" (click)="retry()">
              Reintentar la misma operación
            </button>
          }
        </div>
      </section>
    }`,
})
export class FinanceFeedback {
  readonly intent = inject(FinancialIntent);
  readonly recovered = output<FinanceResult>();
  async recover() {
    const result = await this.intent.recover();
    if (result) this.recovered.emit(result);
  }
  async retry() {
    const result = await this.intent.retry();
    if (result) this.recovered.emit(result);
  }
}
