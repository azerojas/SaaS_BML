import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { PublicFacade } from '../application/public-facade';
import { PublicKind } from '../domain/public-catalog';
import { PublicPhoto } from './public-catalog';
import { pen } from '../../../shared/domain/records';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
@Component({
  selector: 'bm-public-detail',
  imports: [RouterLink, MatButtonModule, PublicPhoto, Alert, Loading],
  providers: [PublicFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="public-content">
    <a class="back-link" routerLink="/catalogo">← Volver al catálogo</a>
    @if (facade.loading()) {
      <bm-loading />
    }
    @if (facade.error(); as error) {
      <bm-alert [message]="error" />
      <p class="muted">El elemento puede no estar publicado o ya no estar disponible.</p>
    }
    @if (facade.record(); as item) {
      <article class="public-detail">
        <bm-public-photo [source]="item.imagen_principal" [name]="item.nombre" />
        <div>
          <p class="eyebrow">{{ item.categoria || 'CUIDADO LASHEO' }}</p>
          <h1>{{ item.nombre }}</h1>
          <p class="public-price">{{ money(item.precio_base ?? item.precio_venta ?? '') }}</p>
          <p class="preserve-lines">{{ item.descripcion || 'Sin descripción publicada.' }}</p>
          @if (item.duracion_minutos) {
            <p>Duración aproximada: {{ item.duracion_minutos }} minutos</p>
          }
          @if (item.disponible !== undefined) {
            <p>{{ item.disponible ? 'Disponible' : 'No disponible actualmente' }}</p>
          }
          <p class="muted">
            Consulta informativa. No se realizan reservas ni cobros desde este catálogo.
          </p>
        </div>
      </article>
    }
  </div>`,
})
export class PublicDetail {
  readonly facade = inject(PublicFacade);
  private readonly route = inject(ActivatedRoute);
  readonly money = pen;
  constructor() {
    void this.facade.get(
      this.route.snapshot.data['kind'] as PublicKind,
      this.route.snapshot.paramMap.get('slug') ?? '',
    );
  }
}
