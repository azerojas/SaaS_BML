import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { PublicFacade } from '../application/public-facade';
import { PublicItem } from '../domain/public-catalog';
import { pen, safeCatalogImage } from '../../../shared/domain/records';
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
    ':host{display:block;aspect-ratio:4/3;overflow:hidden;border-radius:14px;background:var(--cream)}img{width:100%;height:100%;object-fit:cover}.public-photo-placeholder{height:100%;display:grid;place-items:center;color:var(--muted);font:5rem Georgia,serif}',
})
export class PublicPhoto {
  readonly source = input<string | null>(null);
  readonly name = input.required<string>();
  readonly failed = signal(false);
  url() {
    return this.failed() ? null : safeCatalogImage(this.source());
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
      <div class="catalog-filters">
        <label for="public-category"
          >Categoría
          <select
            id="public-category"
            [value]="String(facade.list.query()['categoria'] ?? '')"
            (change)="categoryChange($event)"
          >
            <option value="">Todas</option>
            @for (category of facade.categories.rows(); track category.tipo + category.id) {
              @if (category.tipo === (facade.kind() === 'servicios' ? 'servicio' : 'producto')) {
                <option [value]="String(category.id)">{{ category.nombre }}</option>
              }
            }
          </select>
        </label>
      </div>
    </div>
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
          <article class="public-card">
            <a class="public-card-link" [routerLink]="['/catalogo', facade.kind(), item.slug]">
              <bm-public-photo [source]="item.imagen_principal" [name]="item.nombre" />
              <div class="public-card-copy">
                <p class="eyebrow">{{ item.categoria || 'LASHEO' }}</p>
                <h2>{{ item.nombre }}</h2>
                <p class="public-card-description">
                  {{ item.descripcion || 'Conoce más sobre este elemento del catálogo.' }}
                </p>
                <div class="card-bottom">
                  <span>{{ price(item) }}</span>
                  <span>{{
                    item.duracion_minutos ? item.duracion_minutos + ' min' : 'Ver detalles'
                  }}</span>
                </div>
              </div>
            </a>
            @if (facade.kind() === 'servicios') {
              <div class="public-card-actions">
                <a mat-flat-button routerLink="/reservar" [queryParams]="{ servicio: item.id }"
                  >Reservar cita</a
                >
              </div>
            }
          </article>
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
    <p class="muted public-note">El botón “Reservar cita” abre la página de reservas del salón.</p>
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
  category(value: string) {
    const query = { ...this.facade.list.query() };
    delete query['categoria'];
    if (value) query['categoria'] = value;
    this.facade.list.query.set(query);
    this.facade.list.filter({});
  }
  categoryChange(event: Event) {
    this.category((event.target as HTMLSelectElement).value);
  }
}
