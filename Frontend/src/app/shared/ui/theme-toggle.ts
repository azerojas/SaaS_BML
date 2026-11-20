import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ThemeState } from '../../core/theme/theme-state';
import { Icon } from './icon';

@Component({
  selector: 'bm-theme-toggle',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button
    type="button"
    aria-label="Modo oscuro"
    [attr.aria-pressed]="theme.dark()"
    [title]="theme.dark() ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
    (click)="theme.toggle()"
  >
    <bm-icon [name]="theme.dark() ? 'sun' : 'moon'" />
  </button>`,
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
    }
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border: 1px solid var(--line);
      border-radius: 50%;
      background: var(--paper);
      color: var(--forest);
      cursor: pointer;
    }
    button:hover {
      background: var(--cream);
    }
  `,
})
export class ThemeToggle {
  readonly theme = inject(ThemeState);
}
