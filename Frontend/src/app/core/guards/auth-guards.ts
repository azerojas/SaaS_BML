import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionStore } from '../auth/application/session-store';
import { safeReturnUrl } from '../auth/domain/session';

export const authGuard: CanActivateFn = async (_route, state) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  await session.restore();
  return (
    session.isAuthenticated() ||
    router.createUrlTree(['/login'], { queryParams: { returnUrl: safeReturnUrl(state.url) } })
  );
};
export const anonymousGuard: CanActivateFn = async () => {
  const session = inject(SessionStore);
  const router = inject(Router);
  await session.restore();
  return !session.isAuthenticated() || router.createUrlTree(['/admin']);
};
export const permissionGuard: CanActivateFn = (route) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  const permission: unknown = route.data['permission'];
  const extras: unknown = route.data['permissions'];
  const alternatives: unknown = route.data['anyPermissions'];
  const any = Array.isArray(alternatives) ? alternatives : [];
  const required: unknown[] = [
    ...(typeof permission === 'string' ? [permission] : []),
    ...(Array.isArray(extras) ? extras : []),
  ];
  return (
    ((required.length > 0 || any.length > 0) &&
      required.every((value) => typeof value === 'string' && session.hasPermission(value)) &&
      (!any.length ||
        any.some((value) => typeof value === 'string' && session.hasPermission(value)))) ||
    router.createUrlTree(['/admin/acceso-denegado'])
  );
};
