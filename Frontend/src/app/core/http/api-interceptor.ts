import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError, timeout, TimeoutError } from 'rxjs';
import { ApiFailure, failureMessage, validationFields } from './api-failure';
import { SessionEvents } from './session-events';

export const AUTH_REQUEST = new HttpContextToken<boolean>(() => false);
export const LOCAL_ERROR_HANDLED = new HttpContextToken<boolean>(() => false);

export const apiInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/')) return next(request);
  const events = inject(SessionEvents);
  return next(request.clone({ withCredentials: true })).pipe(
    timeout(10_000),
    catchError((error: unknown) => {
      const status = error instanceof HttpErrorResponse ? error.status : 0;
      const body: unknown = error instanceof HttpErrorResponse ? error.error : null;
      const rawCode = body && typeof body === 'object' && 'code' in body ? body.code : null;
      const code =
        typeof rawCode === 'string'
          ? rawCode
          : error instanceof TimeoutError
            ? 'timeout'
            : 'network';
      if (!request.context.get(AUTH_REQUEST)) {
        if (code === 'not_authenticated' || code === 'mfa_required' || status === 401)
          events.expired.next();
        else if (!request.context.get(LOCAL_ERROR_HANDLED))
          events.notice.set(failureMessage(status, code));
      }
      const fields =
        (status === 400 || status === 422) && body && typeof body === 'object' && 'errors' in body
          ? validationFields(body.errors)
          : {};
      return throwError(() => new ApiFailure(status, code, failureMessage(status, code), fields));
    }),
  );
};
