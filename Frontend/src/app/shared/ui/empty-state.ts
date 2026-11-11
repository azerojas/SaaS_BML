import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { Icon } from './icon';
@Component({
  selector: 'bm-empty-state',
  imports: [Icon, RouterLink, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template:
    '<section><span class="empty-icon"><bm-icon [name]="icon()"/></span><p class="eyebrow">{{ eyebrow() }}</p><h1>{{ title() }}</h1><p class="description">{{ description() }}</p>@if (back()) {<a mat-stroked-button routerLink="/admin">Volver al inicio</a>}</section>',
  styles:
    'section{text-align:center;padding:clamp(2rem,8vw,5rem) 1.5rem;max-width:620px;margin:auto}.empty-icon{display:inline-flex;padding:1.2rem;background:var(--sage);border-radius:22px;color:var(--forest);margin-bottom:1.8rem}.empty-icon bm-icon{width:30px;height:30px}h1{font-size:clamp(1.6rem,4vw,2.3rem);letter-spacing:-1px;margin:.8rem 0 1rem}.description{line-height:1.8;color:var(--muted);margin:0 auto 2rem;max-width:420px}',
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly description = input.required<string>();
  readonly icon = input('sparkles');
  readonly eyebrow = input('CADA COSA, A SU TIEMPO');
  readonly back = input(true);
}
