import { ChangeDetectionStrategy, Component, input } from '@angular/core';

const PATHS: Readonly<Record<string, string>> = {
  home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  calendar:
    'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 10h2m4 0h2m-8 4h2',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3a4 4 0 0 1 0 8M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  sparkles: 'm12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8Zm7-1v4m-2-2h4M3 18v4m-2-2h4',
  box: 'm3 7 9 5 9-5M12 22V12M3 7v10l9 5 9-5V7l-9-5Zm4.5-2.5 9 5',
  receipt: 'M4 3h16v19l-4-2-4 2-4-2-4 2Zm4 5h8m-8 4h8m-8 4h4',
  chart: 'M3 3v18h18M7 16v-5m5 5V7m5 9V4',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  chevron: 'm9 6 6 6-6 6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'm6 6 12 12M6 18 18 6',
  logout: 'M9 3H4v18h5m5-16 7 7-7 7m7-7H9',
  shield: 'm12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Zm-4 9 3 3 5-5',
  lock: 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5Zm7 4v2',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  help: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3m.1 4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  clock: 'M12 8v4l3 2m7-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  check: 'm5 12 4 4L19 6',
};

@Component({
  selector: 'bm-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path [attr.d]="paths[name()] || paths[\'sparkles\']" /></svg>',
  styles:
    ':host {display:inline-flex;width:1.25rem;height:1.25rem;flex-shrink:0} svg{width:100%;height:100%}',
})
export class Icon {
  readonly name = input('sparkles');
  readonly paths = PATHS;
}
