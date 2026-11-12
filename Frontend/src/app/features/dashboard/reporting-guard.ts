import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionStore } from '../../core/auth/application/session-store';
export const reportingGuard: CanActivateFn = () => {
  const session = inject(SessionStore);
  const router = inject(Router);
  return (
    ['reporting.view_summary', 'reporting.view_clients', 'reporting.view_inventory'].some(
      (permission) => session.hasPermission(permission),
    ) || router.createUrlTree(['/admin/acceso-denegado'])
  );
};
