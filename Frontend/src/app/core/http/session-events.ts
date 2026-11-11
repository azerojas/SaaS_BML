import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SessionEvents {
  readonly expired = new Subject<void>();
  readonly notice = signal<string | null>(null);
}
