import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { PublicFacade } from '../application/public-facade';
import { PublicItem } from '../domain/public-catalog';
import { pen, safeHttps } from '../../../shared/domain/records';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Pager } from '../../../shared/ui/pager';
@Component({
  selector: 'bm-public-photo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (url(); as source) {
      <img
        [src]="source"
        [alt]="name()"
        loading="lazy"
        referrerpolicy="no-referrer"
        (error)="failed.set(true)"
      />
    } @else {
      <div class="public-photo-placeholder" aria-hidden="true"><span>✳</span></div>
    }`,
  styles:
    ':host{display:block;aspect-ratio:4/3;overflow:hidden;border-radius:14px;background:var(--cream)}img{width:100%;height:100%;object-fit:cover}.public-photo-placeholder{height:100%;display:grid;place-items:center;color:#72836c;font:5rem Georgia,serif}',
})
export class PublicPhoto {
  readonly source = input<string | null>(null);
  readonly name = input.required<string>();
  readonly failed = signal(false);
  url() {
    return this.failed() ? null : safeHttps(this.source());
  }
}
@Component({
  selector: 'bm-public-catalog',
  imports: [RouterLink, MatButtonModule, PublicPhoto, Alert, Loading, Pager],
  providers: [PublicFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="public-content">
    <header class="public-hero">
      <p class="eyebrow">UN MOMENTO PARA TI</p>
      <h1>El cuidado está<br /><em>en los detalles.</em></h1>
      <p>Descubre nuestros tratamientos y productos.</p>
    </header>
    <div class="public-toolbar">
      <div class="feature-tabs">
        <button
          mat-button
          [attr.aria-pressed]="facade.kind() === 'servicios'"
          (click)="facade.select('servicios')"
        >
          Tratamientos</button
        ><button
          mat-button
          [attr.aria-pressed]="facade.kind() === 'productos'"
          (click)="facade.select('productos')"
        >
          Productos
        </button>
      </div>
      <div>
        <label for="public-search">Buscar en el catálogo</label
        ><input
          id="public-search"
          type="search"
          maxlength="200"
          placeholder="¿Qué estás buscando?"
          (input)="search($event)"
        />
      </div>
    </div>
    <details class="surface filter-extra">
      <summary>Explorar categorías</summary>
      <label for="public-category-search">Buscar categorías</label
      ><input
        id="public-category-search"
        type="search"
        maxlength="200"
        (input)="categorySearch($event)"
      /><label for="public-category">Categoría</label
      ><select
        id="public-category"
        [value]="String(facade.list.query()['categoria'] ?? '')"
        (change)="category($event)"
      >
        <option value="">Todas</option>
        @for (category of facade.categories.rows(); track category.tipo + category.id) {
          @if (category.tipo === (facade.kind() === 'servicios' ? 'servicio' : 'producto')) {
            <option [value]="category.id">{{ category.nombre }}</option>
          }
        }
      </select>
      @if (facade.categories.error(); as error) {
        <bm-alert [message]="error" />
      }
      <bm-pager
        [count]="facade.categories.count()"
        [page]="Number(facade.categories.query()['page'])"
        [busy]="facade.categories.loading()"
        (changed)="facade.categories.page($event)"
      />
    </details>
    @if (facade.list.error(); as error) {
      <bm-alert [message]="error" /><button mat-button (click)="facade.list.reload()">
        Reintentar catálogo
      </button>
    }
    @if (facade.list.loading()) {
      <bm-loading label="Preparando el catálogo…" />
    } @else {
      <section class="public-grid" aria-label="Resultados del catálogo">
        @for (item of facade.list.rows(); track item.id) {
          <a class="public-card" [routerLink]="['/catalogo', facade.kind(), item.slug]"
            ><bm-public-photo [source]="item.imagen_principal" [name]="item.nombre" />
            <p class="eyebrow">{{ item.categoria || 'LASHEO' }}</p>
            <h2>{{ item.nombre }}</h2>
            <div class="card-bottom">
              <span>{{ price(item) }}</span
              ><span>{{
                item.duracion_minutos ? item.duracion_minutos + ' min' : 'Ver detalles →'
              }}</span>
            </div></a
          >
        } @empty {
          <div class="empty-panel wide">
            <h2>No hay elementos publicados para esta búsqueda</h2>
            <p>Prueba otra categoría o vuelve más adelante.</p>
          </div>
        }
      </section>
    }
    <bm-pager
      [count]="facade.list.count()"
      [page]="Number(facade.list.query()['page'])"
      [busy]="facade.list.loading()"
      (changed)="facade.list.page($event)"
    />
    <p class="muted public-note">
      Catálogo informativo. Las reservas y compras online no están disponibles desde esta página.
    </p>
  </div>`,
})
export class PublicCatalog {
  readonly facade = inject(PublicFacade);
  readonly Number = Number;
  readonly String = String;
  constructor() {
    this.facade.initialize();
  }
  price(item: PublicItem) {
    return pen(item.precio_base ?? item.precio_venta ?? '');
  }
  search(event: Event) {
    this.facade.list.filter({ search: (event.target as HTMLInputElement).value });
  }
  categorySearch(event: Event) {
    this.facade.categories.filter({ search: (event.target as HTMLInputElement).value });
  }
  category(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    const query = { ...this.facade.list.query() };
    delete query['categoria'];
    if (value) query['categoria'] = value;
    this.facade.list.query.set(query);
    this.facade.list.filter({});
  }
}
