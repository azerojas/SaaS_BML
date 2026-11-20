import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'bm-brand',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="brand-mark" aria-hidden="true"
      ><svg viewBox="0 0 36 36">
        <path
          d="M18 18C5-1-3 13 18 18Zm0 0C37 5 23-3 18 18Zm0 0c13 19 21 5 0 0Zm0 0C-1 31 13 39 18 18Z"
          fill="currentColor"
        /></svg></span
    ><span class="brand-name"
      >lasheo<span class="brand-caption">{{
        ' ' + (compact() ? 'BEAUTY MANAGER' : 'TU ESPACIO, EN ARMONÍA')
      }}</span></span
    >`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 0.7rem;
      color: var(--ink);
    }
    .brand-mark {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      color: var(--forest);
    }
    svg {
      width: 100%;
      height: 100%;
    }
    .brand-name {
      font-size: 1.8rem;
      font-weight: 750;
      letter-spacing: -1.3px;
      line-height: 1;
    }
    .brand-caption {
      display: block;
      font-size: 0.5rem;
      letter-spacing: 2px;
      font-weight: 650;
      margin-top: 8px;
      color: var(--muted);
    }
  `,
})
export class Brand {
  readonly compact = input(true);
}
