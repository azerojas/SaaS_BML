import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, switchMap } from 'rxjs';
import { AUTH_REQUEST } from '../../http/api-interceptor';
import { CurrentUser, isCurrentUser, MfaChallenge, MfaResult } from '../domain/session';
import { ApiFailure } from '../../http/api-failure';

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);
  private options() {
    return { context: new HttpContext().set(AUTH_REQUEST, true) };
  }
  csrf() {
    return this.http.get<unknown>('/api/auth/csrf/', this.options());
  }
  me() {
    return this.http.get<unknown>('/api/auth/me/', this.options()).pipe(
      map((value) => {
        if (!isCurrentUser(value))
          throw new ApiFailure(
            503,
            'invalid_contract',
            'No pudimos verificar tu acceso. Contacta a la persona administradora.',
          );
        return value;
      }),
    );
  }
  login(username: string, password: string) {
    return this.csrf().pipe(
      switchMap(() =>
        this.http.post<CurrentUser | MfaChallenge>(
          '/api/auth/login/',
          { username, password },
          this.options(),
        ),
      ),
    );
  }
  verify(code: string) {
    return this.csrf().pipe(
      switchMap(() => this.http.post<MfaResult>('/api/auth/mfa/verify/', { code }, this.options())),
    );
  }
  logout() {
    return this.csrf().pipe(
      switchMap(() => this.http.post<void>('/api/auth/logout/', {}, this.options())),
    );
  }
}
