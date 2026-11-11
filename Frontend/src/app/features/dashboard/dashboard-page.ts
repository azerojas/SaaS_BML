import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionStore } from '../../core/auth/application/session-store';
import { visibleNavigation } from '../../core/config/navigation';
import { Icon } from '../../shared/ui/icon';

@Component({
  selector: 'bm-dashboard-page',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  readonly session = inject(SessionStore);
  readonly shortcuts = computed(() =>
    visibleNavigation((permission) => this.session.hasPermission(permission)).filter(
      (item) => item.path !== '/admin',
    ),
  );
  readonly today = new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Lima',
  }).format(new Date());
}
