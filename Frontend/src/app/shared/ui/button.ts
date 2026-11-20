import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Icon } from './icon';

@Component({
  selector: 'bm-button',
  imports: [MatButtonModule, MatProgressSpinnerModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button
    mat-flat-button
    [type]="type()"
    [disabled]="disabled() || busy()"
    [class.full]="full()"
    [attr.aria-busy]="busy()"
  >
    @if (busy()) {
      <mat-spinner diameter="18" aria-label="Procesando" />
    }
    <span><ng-content /></span>
    @if (arrow() && !busy()) {
      <bm-icon name="arrow" />
    }
  </button>`,
  styles:
    ':host{display:inline-block}:host(.full){display:block}button{height:36px;min-height:36px;border-radius:8px;padding-inline:12px;font-size:13px;letter-spacing:0;font-weight:650;gap:8px}.full{width:100%}button span{margin:0}mat-spinner{display:inline-block;vertical-align:middle}',
})
export class Button {
  readonly type = input<'button' | 'submit'>('button');
  readonly busy = input(false);
  readonly disabled = input(false);
  readonly full = input(false);
  readonly arrow = input(false);
}
