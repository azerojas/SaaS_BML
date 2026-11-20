import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { filter, firstValueFrom, map, startWith } from 'rxjs';
import { SessionStore } from '../../core/auth/application/session-store';
import { SessionEvents } from '../../core/http/session-events';
import {
  groupedNavigation,
  NavigationGroup,
  visibleNavigation,
} from '../../core/config/navigation';
import { Brand } from '../../shared/ui/brand';
import { ThemeToggle } from '../../shared/ui/theme-toggle';
import { Icon } from '../../shared/ui/icon';
import { Alert } from '../../shared/ui/alert';
import { Loading } from '../../shared/ui/loading';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { ProfileDialog, ProfilePreferences, profilePreferences } from './profile-dialog';

@Component({
  selector: 'bm-admin-layout',
  imports: [
    MatMenuModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    Brand,
    ThemeToggle,
    Icon,
    Alert,
    Loading,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
})
export class AdminLayout {
  readonly mobile = toSignal(
    inject(BreakpointObserver)
      .observe(
        '(max-width: 600px), (max-width: 960px) and (max-height: 500px) and (pointer: coarse)',
      )
      .pipe(map((result) => result.matches)),
    { initialValue: false },
  );
  readonly mobileMenuOpen = signal(false);
  private mobileMenu: MatDialogRef<unknown> | null = null;
  constructor() {
    effect(() => {
      if (!this.mobile()) this.closeMobileMenu();
    });
  }
  openMobileMenu(template: TemplateRef<unknown>) {
    if (this.mobileMenu) return;
    this.mobileMenuOpen.set(true);
    this.mobileMenu = this.dialog.open(template, {
      width: '340px',
      maxWidth: 'calc(100vw - 32px)',
      height: '100dvh',
      maxHeight: '100dvh',
      position: { top: '0', left: '0' },
      panelClass: 'mobile-nav-dialog',
      ariaLabel: 'Menú de navegación',
      autoFocus: '.mobile-nav-close',
    });
    this.mobileMenu.afterClosed().subscribe(() => {
      this.mobileMenu = null;
      this.mobileMenuOpen.set(false);
    });
  }
  closeMobileMenu() {
    this.mobileMenu?.close();
  }
  readonly session = inject(SessionStore);
  readonly events = inject(SessionEvents);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects.split('?')[0].split('#')[0]),
      startWith(this.router.url),
    ),
  );
  private readonly preferences = profilePreferences(this.session.currentUser()?.id);
  readonly compact = signal(this.preferences.compact);
  readonly showUsername = signal(this.preferences.showUsername);
  readonly navigation = computed(() =>
    visibleNavigation((permission) => this.session.hasPermission(permission)),
  );
  readonly groups = computed(() => groupedNavigation(this.navigation()));
  isGroupActive(group: NavigationGroup) {
    const url = this.currentUrl() ?? '';
    return group.items.some((item) => {
      const root = item.path.split('/').slice(0, 3).join('/');
      return url === root || url.startsWith(root + '/');
    });
  }
  readonly initials = computed(() =>
    this.session
      .displayName()
      .split(/[\s_]+/)
      .slice(0, 2)
      .map((name) => name[0] ?? '')
      .join('')
      .toUpperCase(),
  );
  async configureProfile() {
    const result = await firstValueFrom(
      this.dialog
        .open<ProfileDialog, ProfilePreferences, ProfilePreferences>(ProfileDialog, {
          width: '520px',
          maxWidth: '94vw',
          data: { compact: this.compact(), showUsername: this.showUsername() },
        })
        .afterClosed(),
    );
    if (result) {
      this.compact.set(result.compact);
      this.showUsername.set(result.showUsername);
    }
  }
  async logout() {
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
