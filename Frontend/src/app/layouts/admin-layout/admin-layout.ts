import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { A11yModule } from '@angular/cdk/a11y';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { SessionStore } from '../../core/auth/application/session-store';
import { SessionEvents } from '../../core/http/session-events';
import { visibleNavigation } from '../../core/config/navigation';
import { Brand } from '../../shared/ui/brand';
import { Icon } from '../../shared/ui/icon';
import { Alert } from '../../shared/ui/alert';
import { Loading } from '../../shared/ui/loading';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';

@Component({
  selector: 'bm-admin-layout',
  imports: [
    A11yModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    Brand,
    Icon,
    Alert,
    Loading,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
})
export class AdminLayout {
  readonly session = inject(SessionStore);
  readonly events = inject(SessionEvents);
  private readonly dialog = inject(MatDialog);
  readonly menuOpen = signal(false);
  readonly navigation = computed(() =>
    visibleNavigation((permission) => this.session.hasPermission(permission)),
  );
  readonly initials = computed(() =>
    this.session
      .displayName()
      .split(/[\s_]+/)
      .slice(0, 2)
      .map((name) => name[0] ?? '')
      .join('')
      .toUpperCase(),
  );
  readonly today = new Intl.DateTimeFormat('es-PE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Lima',
  }).format(new Date());
  async logout() {
    this.menuOpen.set(false);
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialog, {
          width: '420px',
          maxWidth: '92vw',
          data: {
            title: '¿Terminamos por ahora?',
            description:
              'Cerraremos tu sesión en este navegador. Para volver a tu espacio necesitarás iniciar sesión de nuevo.',
            confirm: 'Cerrar sesión',
          },
        })
        .afterClosed(),
    );
    if (confirmed) await this.session.logout();
  }
}
