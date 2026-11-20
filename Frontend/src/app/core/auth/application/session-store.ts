import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiFailure } from '../../http/api-failure';
import { SessionEvents } from '../../http/session-events';
import { AuthState, canAccess, CurrentUser, safeReturnUrl } from '../domain/session';
import { AuthApi } from '../infrastructure/auth-api';

@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly api = inject(AuthApi);
  private readonly router = inject(Router);
  private readonly events = inject(SessionEvents);
  private readonly destroyRef = inject(DestroyRef);
  private hydration: Promise<void> | null = null;
  readonly state = signal<AuthState>('unknown');
  readonly currentUser = signal<CurrentUser | null>(null);
  readonly isBusy = signal(false);
  readonly error = signal<string | null>(null);
  readonly mfaRequired = signal(false);
  readonly recoveryCodes = signal<readonly string[]>([]);
  readonly logoutPending = signal(false);
  readonly isAuthenticated = computed(() => this.state() === 'authenticated');
  readonly displayName = computed(
    () => this.currentUser()?.nombre.trim() || this.currentUser()?.username || '',
  );

  constructor() {
    this.events.expired.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      const returnUrl = safeReturnUrl(this.router.url);
      this.clear();
      this.error.set('Tu sesión terminó. Inicia sesión de nuevo para continuar.');
      void this.router.navigate(['/login'], { queryParams: { returnUrl }, replaceUrl: true });
    });
  }

  hasPermission(permission: string) {
    return canAccess(this.currentUser(), permission);
  }
  restore(force = false): Promise<void> {
    if (this.hydration) return this.hydration;
    if (!force && this.state() !== 'unknown') return Promise.resolve();
    if (this.logoutPending()) return Promise.resolve();
    const wasAuthenticated = this.isAuthenticated();
    if (!wasAuthenticated) this.state.set('loading');
    this.hydration = firstValueFrom(this.api.me())
      .then((user) => {
        this.currentUser.set(user);
        this.state.set('authenticated');
        this.error.set(null);
      })
      .catch((error: unknown) => {
        this.clear();
        if (
          error instanceof ApiFailure &&
          (error.code === 'not_authenticated' || error.code === 'mfa_required')
        ) {
          if (wasAuthenticated)
            this.error.set('Tu sesión terminó. Inicia sesión de nuevo para continuar.');
        } else
          this.error.set(
            error instanceof ApiFailure
              ? error.message
              : 'No pudimos verificar tu sesión. Inténtalo de nuevo.',
          );
      })
      .finally(() => {
        this.hydration = null;
      });
    return this.hydration;
  }

  async login(username: string, password: string): Promise<boolean> {
    if (this.isBusy()) return false;
    this.isBusy.set(true);
    this.error.set(null);
    try {
      const response = await firstValueFrom(this.api.login(username, password));
      this.logoutPending.set(false);
      if ('mfa_required' in response) {
        this.mfaRequired.set(true);
        return false;
      }
      await this.restore(true);
      return this.isAuthenticated();
    } catch (error: unknown) {
      this.fail(error);
      return false;
    } finally {
      this.isBusy.set(false);
    }
  }

  async verify(code: string): Promise<boolean> {
    if (this.isBusy()) return false;
    this.isBusy.set(true);
    this.error.set(null);
    try {
      const response = await firstValueFrom(this.api.verify(code));
      const codes = response.recovery_codes ?? [];
      await this.restore(true);
      this.recoveryCodes.set(codes);
      this.mfaRequired.set(false);
      return this.isAuthenticated();
    } catch (error: unknown) {
      if (error instanceof ApiFailure && error.code === 'mfa_challenge_expired') this.clear();
      this.fail(error);
      return false;
    } finally {
      this.isBusy.set(false);
    }
  }

  async logout(): Promise<boolean> {
    if (this.isBusy()) return false;
    this.isBusy.set(true);
    let confirmed = false;
    try {
      await firstValueFrom(this.api.logout());
      confirmed = true;
    } catch (error: unknown) {
      confirmed = error instanceof ApiFailure && error.code === 'not_authenticated';
    } finally {
      this.clear();
      this.isBusy.set(false);
      this.logoutPending.set(!confirmed);
      this.error.set(
        confirmed
          ? null
          : 'No pudimos confirmar el cierre en el servidor. Reintenta antes de dejar este equipo.',
      );
      await this.router.navigate(['/login'], { replaceUrl: true });
    }
    return confirmed;
  }

  useAnotherAccount() {
    this.mfaRequired.set(false);
    this.error.set(null);
  }
  clearRecoveryCodes() {
    this.recoveryCodes.set([]);
  }
  private clear() {
    this.currentUser.set(null);
    this.state.set('anonymous');
    this.mfaRequired.set(false);
    this.recoveryCodes.set([]);
  }
  private fail(error: unknown) {
    this.error.set(
      error instanceof ApiFailure
        ? error.message
        : 'No pudimos completar el acceso. Inténtalo de nuevo.',
    );
  }
}
