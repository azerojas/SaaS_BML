import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon } from './icon';

@Component({
  selector: 'bm-alert',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div
    [attr.role]="kind() === 'error' ? 'alert' : 'status'"
    [class.error]="kind() === 'error'"
  >
    <bm-icon [name]="kind() === 'error' ? 'help' : 'shield'" />
    <p>{{ message() }}</p>
  </div>`,
  styles:
    ':host{display:block;margin-bottom:1.3rem}div{display:flex;align-items:flex-start;gap:.7rem;padding:1rem;border-radius:12px;background:var(--sage);color:var(--forest);font-size:.83rem;line-height:1.6}.error{background:var(--error-soft);color:var(--on-error)}p{margin:0}bm-icon{margin-top:.12rem}',
})
export class Alert {
  readonly message = input.required<string>();
  readonly kind = input<'info' | 'error'>('error');
}
