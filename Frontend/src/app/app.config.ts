import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { SessionStore } from './core/auth/application/session-store';
import { apiInterceptor } from './core/http/api-interceptor';
import { SafeErrorHandler } from './app';
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideHttpClient(
      withXsrfConfiguration({ cookieName: 'csrftoken', headerName: 'X-CSRFToken' }),
      withInterceptors([apiInterceptor]),
    ),
    provideAppInitializer(() => inject(SessionStore).restore()),
    { provide: ErrorHandler, useClass: SafeErrorHandler },
  ],
};
