import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent, merge } from 'rxjs';
@Injectable({ providedIn: 'root' })
export class PwaState {
  readonly online = signal(navigator.onLine);
  readonly updateReady = signal(false);
  readonly brokenVersion = signal(false);
  readonly blocked = computed(() => !this.online() || this.updateReady() || this.brokenVersion());
  constructor() {
    const destroy = inject(DestroyRef);
    merge(fromEvent(window, 'online'), fromEvent(window, 'offline'))
      .pipe(takeUntilDestroyed(destroy))
      .subscribe(() => this.online.set(navigator.onLine));
    const updates = inject(SwUpdate, { optional: true });
    if (updates?.isEnabled) {
      updates.versionUpdates.pipe(takeUntilDestroyed(destroy)).subscribe((event) => {
        if (event.type === 'VERSION_READY') this.updateReady.set(true);
      });
      updates.unrecoverable
        .pipe(takeUntilDestroyed(destroy))
        .subscribe(() => this.brokenVersion.set(true));
      const timer = setInterval(() => {
        if (navigator.onLine) void updates.checkForUpdate().catch(() => undefined);
      }, 300000);
      destroy.onDestroy(() => clearInterval(timer));
    }
  }
}
