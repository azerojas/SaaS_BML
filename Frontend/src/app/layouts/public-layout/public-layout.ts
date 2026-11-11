import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { Brand } from '../../shared/ui/brand';
@Component({
  selector: 'bm-public-layout',
  imports: [RouterOutlet, RouterLink, Brand],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template:
    '<header><a routerLink="/catalogo" aria-label="Lasheo, catálogo público"><bm-brand/></a><a routerLink="/catalogo">Explorar catálogo</a></header><main id="main-content" tabindex="-1"><router-outlet/></main><footer>Lasheo · Un espacio de cuidado</footer>',
  styles:
    ':host{display:flex;min-height:100dvh;flex-direction:column;background:var(--canvas)}header{padding:2rem clamp(1.5rem,6vw,5rem);border-bottom:1px solid var(--line);background:var(--paper)}header a{text-decoration:none}main{flex:1;padding:2rem 1rem;outline:none}footer{padding:2rem;text-align:center;font-size:.7rem;color:var(--muted)}',
})
export class PublicLayout {}
