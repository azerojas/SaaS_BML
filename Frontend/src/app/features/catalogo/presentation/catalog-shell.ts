import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionStore } from '../../../core/auth/application/session-store';
import { DEFINITIONS } from '../domain/catalog';
@Component({
  selector: 'bm-catalog-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<nav class="feature-tabs" aria-label="Secciones del catálogo">
      @for (item of items; track item.kind) {
        @if (session.hasPermission('negocio.view_' + item.model)) {
          <a [routerLink]="['/admin/catalogo', item.kind]" routerLinkActive="selected">{{
            item.title
          }}</a>
        }
      }
      <a routerLink="/catalogo">Ver catálogo público ↗</a>
    </nav>
    <router-outlet />`,
})
export class CatalogShell {
  readonly session = inject(SessionStore);
  readonly items = Object.values(DEFINITIONS);
}
