import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icon } from './icon';

@Component({
  selector: 'bm-form-feedback',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div
    class="feedback"
    [class.compact]="compact()"
    [class.has-error]="hasError()"
    [attr.role]="hasError() ? 'alert' : null"
    [attr.tabindex]="hasError() ? 0 : null"
  >
    <bm-icon [name]="hasError() ? 'help' : 'shield'" />
    <div>
      @if (message()) {
        <p>{{ message() }}</p>
      }
      @for (error of messages(); track $index) {
        <p>{{ error }}</p>
      }
      @if (!hasError()) {
        <p>{{ hint() }}</p>
      }
    </div>
  </div>`,
  styles: `
    :host {
      display: block;
      min-width: 0;
      margin-bottom: 16px;
    }
    .feedback {
      display: flex;
      align-items: flex-start;
      gap: 9px;
      block-size: 68px;
      box-sizing: border-box;
      padding: 12px 14px;
      overflow: auto;
      scrollbar-width: thin;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--surface-low);
      color: var(--muted);
      font-size: 12px;
      line-height: 20px;
    }
    .feedback.has-error {
      border-color: var(--error);
      color: var(--error);
      background: var(--error-soft);
    }
    .feedback.compact {
      block-size: auto;
      padding: 9px 12px;
    }
    bm-icon {
      width: 17px;
      height: 17px;
      margin-top: 2px;
      flex-shrink: 0;
    }
    .feedback > div {
      min-width: 0;
    }
    p {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .feedback:focus-visible {
      outline: 2px solid var(--forest);
      outline-offset: 2px;
    }
  `,
})
export class FormFeedback {
  readonly compact = input(false);
  readonly message = input<string | null>(null);
  readonly errors = input<Readonly<Record<string, readonly string[]>>>({});
  readonly hint = input('Los campos con * son obligatorios. Revisa los datos antes de guardar.');
  readonly messages = computed(() => Object.values(this.errors()).flat());
  readonly hasError = computed(() => !!this.message() || this.messages().length > 0);
}
