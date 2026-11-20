import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ErrorHandler,
  inject,
  Injectable,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent, filter, exhaustMap, from } from 'rxjs';
import { SessionStore } from './core/auth/application/session-store';
import { SessionEvents } from './core/http/session-events';
import { safeReturnUrl } from './core/auth/domain/session';
import { PwaBanner } from './core/pwa/pwa-banner';
import { PwaState } from './core/pwa/pwa-state';
import { ThemeState } from './core/theme/theme-state';

@Injectable()
export class SafeErrorHandler implements ErrorHandler {
  private readonly events = inject(SessionEvents);
  handleError(): void {
    this.events.notice.set(
      'Ocurrió un problema inesperado. Intenta de nuevo o vuelve a iniciar sesión.',
    );
  }
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, PwaBanner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template:
    '<a class="skip-link" href="#main-content">Saltar al contenido</a><bm-pwa-banner/><fieldset class="application-shell" [disabled]="pwa.blocked()"><router-outlet/></fieldset>',
  styles: '.application-shell{border:0;padding:0;margin:0;min-width:0}',
})
export class App {
  private readonly theme = inject(ThemeState);
  readonly pwa = inject(PwaState);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  constructor() {
    fromEvent(document, 'visibilitychange')
      .pipe(
        filter(
          () =>
            document.visibilityState === 'visible' &&
            this.session.isAuthenticated() &&
            !this.session.isBusy() &&
            !this.session.recoveryCodes().length,
        ),
        exhaustMap(() => from(this.session.restore(true))),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => {
        if (!this.session.isAuthenticated())
          void this.router.navigate(['/login'], {
            queryParams: { returnUrl: safeReturnUrl(this.router.url) },
          });
      });
  }
}
