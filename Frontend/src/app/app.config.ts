import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  isDevMode,
} from '@angular/core';
import { provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { SessionStore } from './core/auth/application/session-store';
import { apiInterceptor } from './core/http/api-interceptor';
import { SafeErrorHandler } from './app';
import { provideServiceWorker } from '@angular/service-worker';
export const appConfig: ApplicationConfig = {
  providers: [
    provideServiceWorker('ngsw-worker.js', {
      // Loopback uses a private CA that browsers may not trust for workers.
      enabled: !isDevMode() && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideHttpClient(
      withXsrfConfiguration({ cookieName: 'csrftoken', headerName: 'X-CSRFToken' }),
      withInterceptors([apiInterceptor]),
    ),
    provideAppInitializer(() => {
      const hydration = inject(SessionStore).restore();
      // Start public login chunks while session restoration is in flight; guards still decide access.
      if (location.pathname === '/login') {
        void import('./core/auth/presentation/login-page').catch(() => undefined);
        void import('./layouts/auth-layout/auth-layout').catch(() => undefined);
      }
      return hydration;
    }),
    { provide: ErrorHandler, useClass: SafeErrorHandler },
  ],
};
