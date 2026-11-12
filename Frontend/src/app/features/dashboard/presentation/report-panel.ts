import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
interface PanelState {
  loading(): boolean;
  error(): string | null;
  data(): unknown;
  retry(): void;
}
@Component({
  selector: 'bm-report-panel',
  imports: [MatButtonModule, Alert, Loading],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="surface analytics-panel">
    <h2>{{ title() }}</h2>
    @if (state().loading()) {
      <bm-loading />
    }
    @if (state().error(); as error) {
      <bm-alert [message]="error" /><button
        mat-stroked-button
        type="button"
        (click)="state().retry()"
        [disabled]="state().loading()"
        [attr.aria-label]="'Reintentar ' + title()"
      >
        Reintentar consulta
      </button>
    }
    @if (state().data()) {
      <ng-content />
    }
  </section>`,
})
export class ReportPanel {
  readonly title = input.required<string>();
  readonly state = input.required<PanelState>();
}
