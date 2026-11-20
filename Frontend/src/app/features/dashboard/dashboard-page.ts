import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SessionStore } from '../../core/auth/application/session-store';
import { Icon } from '../../shared/ui/icon';
import { ReportsPage } from './presentation/reports-page';

@Component({
  selector: 'bm-dashboard-page',
  imports: [Icon, ReportsPage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  readonly session = inject(SessionStore);
  readonly canViewReports = [
    'reporting.view_summary',
    'reporting.view_clients',
    'reporting.view_inventory',
  ].some((permission) => this.session.hasPermission(permission));
  readonly today = new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Lima',
  }).format(new Date());
}
