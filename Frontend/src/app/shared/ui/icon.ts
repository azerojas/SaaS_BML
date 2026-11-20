import { ChangeDetectionStrategy, Component, input } from '@angular/core';

const PATHS: Readonly<Record<string, string>> = {
  qr: 'M3 3h6v6H3Zm12 0h6v6h-6ZM3 15h6v6H3ZM5 5h2v2H5Zm12 0h2v2h-2ZM5 17h2v2H5ZM12 3v3m0 3v3H9m-6 0h3m6 3h3v-3h3v3h3v6h-3v-3h-3v3h-3v-3m9-6h-1',
  printer: 'M6 9V3h12v6M6 18H3V9h18v9h-3M6 14h12v7H6Zm12-2h.01',
  moon: 'M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z',
  sun: 'M12 3V1m0 22v-2M3 12H1m22 0h-2M5.6 5.6 4.2 4.2m15.6 15.6-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',
  phone:
    'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm-2 2 10 7L22 6',
  plus: 'M12 5v14M5 12h14',
  camera: 'M3 7h4l2-4h6l2 4h4v14H3ZM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  image: 'M3 3h18v18H3ZM3 17l5-5 4 4 3-3 6 6M16 7h.01',
  edit: 'm16 3 5 5M4 20l4-1L21 6a2.1 2.1 0 0 0-3-3L5 16l-1 4Z',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  restore: 'M3 11a9 9 0 1 1 2 7M3 4v7h7',
  power: 'M12 2v10M6.3 5.3a9 9 0 1 0 11.4 0',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2ZM7 3v6h10V3M7 21v-8h10v8',
  search: 'M21 21l-4.5-4.5M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
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
