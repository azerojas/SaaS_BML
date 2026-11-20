import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Brand } from '../../shared/ui/brand';
import { ThemeToggle } from '../../shared/ui/theme-toggle';
@Component({
  selector: 'bm-public-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Brand, ThemeToggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<header class="public-header">
      <div class="header-inner">
        <a class="brand-link" routerLink="/catalogo"><bm-brand [compact]="false" /></a>
        <nav aria-label="Navegación principal">
          <a routerLink="/catalogo" routerLinkActive="active" ariaCurrentWhenActive="page"
            >Explorar catálogo</a
          ><a routerLink="/mis-reservas" routerLinkActive="active" ariaCurrentWhenActive="page"
            >Mis reservas</a
          >
          <bm-theme-toggle />
        </nav>
      </div>
    </header>
    <main id="main-content" tabindex="-1"><router-outlet /></main>
    <footer>
      <div class="footer-inner">
        <div><strong>lasheo</strong><span>Un espacio de cuidado, pensado para ti.</span></div>
        <span>Tu próxima visita empieza aquí.</span>
      </div>
    </footer>`,
  styleUrl: './public-layout.scss',
})
export class PublicLayout {}
