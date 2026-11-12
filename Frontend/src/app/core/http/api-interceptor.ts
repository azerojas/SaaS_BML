import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, of, switchMap, throwError, timeout, TimeoutError } from 'rxjs';
import { ApiFailure, failureMessage, validationFields } from './api-failure';
import { SessionEvents } from './session-events';

export const AUTH_REQUEST = new HttpContextToken<boolean>(() => false);
export const LOCAL_ERROR_HANDLED = new HttpContextToken<boolean>(() => false);
export const PUBLIC_REQUEST = new HttpContextToken<boolean>(() => false);

export const apiInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/')) return next(request);
  const events = inject(SessionEvents);
  const publicRequest = request.context.get(PUBLIC_REQUEST);
  return next(request.clone({ withCredentials: !publicRequest })).pipe(
    timeout(10_000),
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.error instanceof Blob) {
        const blob = error.error;
        const decoded =
          blob.size <= 65536
            ? from(blob.text()).pipe(
                switchMap((text) => {
                  try {
                    return of(JSON.parse(text) as unknown);
                  } catch {
                    return of(null);
                  }
                }),
                catchError(() => of(null)),
              )
            : of(null);
        return decoded.pipe(
          switchMap((body) =>
            failure(
              new HttpErrorResponse({
                error: body,
                status: error.status,
                statusText: error.statusText,
                headers: error.headers,
                url: error.url ?? undefined,
              }),
            ),
          ),
        );
      }
      return failure(error);
    }),
  );
  function failure(error: unknown) {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const body: unknown = error instanceof HttpErrorResponse ? error.error : null;
    const rawCode = body && typeof body === 'object' && 'code' in body ? body.code : null;
    const code =
      typeof rawCode === 'string' ? rawCode : error instanceof TimeoutError ? 'timeout' : 'network';
    if (!publicRequest && !request.context.get(AUTH_REQUEST)) {
      if (code === 'not_authenticated' || code === 'mfa_required' || status === 401)
        events.expired.next();
      else if (!request.context.get(LOCAL_ERROR_HANDLED))
        events.notice.set(failureMessage(status, code));
    }
    const fields =
      (status === 400 || status === 422) && body && typeof body === 'object' && 'errors' in body
        ? validationFields(body.errors)
        : {};
    const retryHeader =
      error instanceof HttpErrorResponse ? error.headers.get('Retry-After') : null;
    const retryAfter =
      retryHeader && /^\d+$/.test(retryHeader) ? Math.min(Number(retryHeader), 86400) : null;
    return throwError(
      () => new ApiFailure(status, code, failureMessage(status, code), fields, retryAfter),
    );
  }
};
