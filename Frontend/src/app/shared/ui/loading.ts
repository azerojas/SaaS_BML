import { ChangeDetectionStrategy, Component, input } from '@angular/core';
@Component({
  selector: 'bm-loading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template:
    '<section role="status" aria-live="polite" class="loading"><span class="pulse"></span><p>{{ label() }}</p><div class="skeleton"></div><div class="skeleton short"></div></section>',
  styles:
    '.loading{padding:3rem 1rem;color:var(--muted);text-align:center}.pulse{display:inline-block;width:24px;height:24px;border:2px solid var(--line);border-top-color:var(--forest);border-radius:50%;animation:turn 1s linear infinite}.skeleton{height:12px;max-width:300px;margin:1rem auto;background:var(--line);border-radius:8px}.short{max-width:180px}@keyframes turn{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.pulse{animation:none}}',
})
export class Loading {
  readonly label = input('Estamos preparando tu espacio…');
}
