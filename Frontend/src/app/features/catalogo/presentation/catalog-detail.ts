import { ChangeDetectionStrategy, Component, inject, input, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { SessionStore } from '../../../core/auth/application/session-store';
import { pen } from '../../../shared/domain/records';
import { CatalogFacade } from '../application/catalog-facade';
import { StockFacade } from '../application/stock-facade';
import { DEFINITIONS, Kind } from '../domain/catalog';
import { RecipeEditor } from './recipe-editor';
import { GalleryEditor } from './gallery-editor';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
@Component({
  selector: 'bm-stock-readonly',
  imports: [Alert, Loading],
  providers: [StockFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="surface section-gap">
    <h2>Existencia de inventario</h2>
    <p class="muted">
      Lectura de la vista de stock. No se pueden registrar compras ni movimientos desde esta ficha.
    </p>
    @if (facade.loading()) {
      <bm-loading />
    }
    @if (facade.error(); as error) {
      <bm-alert [message]="error" />
    }
    <dl class="details-grid">
      @for (row of facade.record()?.results; track row.articulo_id) {
        <div>
          <dt>Existencia registrada</dt>
          <dd>{{ row.existencia }} {{ row.unidad }}</dd>
        </div>
        <div>
          <dt>Stock mínimo</dt>
          <dd>{{ row.stock_minimo }} {{ row.unidad }}</dd>
        </div>
        <div>
          <dt>Alerta</dt>
          <dd>{{ row.bajo_minimo ? 'Por debajo del mínimo' : 'Sin alerta de mínimo' }}</dd>
        </div>
      } @empty {
        @if (!facade.loading() && !facade.error()) {
          <p>Sin lectura de stock disponible.</p>
        }
      }
    </dl>
  </section>`,
})
export class StockReadonly implements OnInit {
  readonly facade = inject(StockFacade);
  readonly articleId = input.required<number>();
  ngOnInit() {
    void this.facade.get(this.articleId());
  }
}
@Component({
  selector: 'bm-catalog-detail',
  imports: [
    RouterLink,
    MatButtonModule,
    Alert,
    Loading,
    RecipeEditor,
    GalleryEditor,
    StockReadonly,
  ],
  providers: [CatalogFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<a class="back-link" [routerLink]="base">← {{ definition.title }}</a>
    @if (facade.loading()) {
      <bm-loading />
    }
    @if (facade.error(); as error) {
      <bm-alert [message]="error" />
    }
    @if (facade.success(); as success) {
      <bm-alert kind="info" [message]="success" />
    }
    @if (facade.record(); as row) {
      <header class="feature-heading">
        <div>
          <p class="eyebrow">{{ definition.title }}</p>
          <h1>{{ row.nombre }}</h1>
          <p>{{ row['categoria_nombre'] || row['codigo'] || 'Cada detalle, en su lugar.' }}</p>
        </div>
        <div class="form-actions">
          @if (session.hasPermission('negocio.change_' + definition.model)) {
            <a mat-stroked-button routerLink="editar">Editar {{ definition.singular }}</a>
            @if (definition.active) {
              <button mat-button type="button" [disabled]="facade.busy()" (click)="toggle()">
                {{ active() ? 'Desactivar' : 'Reactivar' }}
              </button>
            }
          }
          @if (row['visible_catalogo'] && row['slug']) {
            <a
              mat-button
              [routerLink]="[
                '/catalogo',
                kind === 'servicios' ? 'servicios' : 'productos',
                row['slug'],
              ]"
              >Vista pública ↗</a
            >
          }
        </div>
      </header>
      <section class="surface">
        <h2>Información de {{ definition.singular }}</h2>
        <dl class="details-grid">
          @for (field of definition.fields; track field.key) {
            <div [class.wide]="field.type === 'textarea'">
              <dt>{{ field.label }}</dt>
              <dd class="preserve-lines">{{ display(field.key) }}</dd>
            </div>
          }
        </dl>
      </section>
      @if (kind === 'servicios') {
        <bm-recipe-editor [serviceId]="row.id" /><bm-gallery-editor
          kind="servicios"
          [parentId]="row.id"
        />
      } @else if (kind === 'articulos') {
        <bm-stock-readonly [articleId]="row.id" /><bm-gallery-editor
          kind="articulos"
          [parentId]="row.id"
        />
      }
    } `,
})
export class CatalogDetail {
  readonly facade = inject(CatalogFacade);
  readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  readonly kind = this.route.snapshot.data['kind'] as Kind;
  readonly definition = DEFINITIONS[this.kind];
  readonly base = '/admin/catalogo/' + this.kind;
  constructor() {
    this.facade.configure(this.kind);
    void this.facade.get(Number(this.route.snapshot.paramMap.get('id')));
  }
  active() {
    const row = this.facade.record();
    return row?.[this.kind === 'categorias-servicio' ? 'activa' : 'activo'] === true;
  }
  display(key: string) {
    const value = this.facade.record()?.[key];
    return typeof value === 'boolean'
      ? value
        ? 'Sí'
        : 'No'
      : value === null || value === undefined || value === ''
        ? 'Sin registrar'
        : key === 'precio_base' || key === 'precio_venta'
          ? pen(String(value))
          : String(value);
  }
  async toggle() {
    const active = this.active();
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialog, {
          data: {
            title: active ? '¿Desactivar registro?' : '¿Reactivar registro?',
            description:
              'Se conserva su historia. Desactivarlo retira su publicación; reactivarlo no lo publica automáticamente.',
            confirm: active ? 'Desactivar' : 'Reactivar',
          },
        })
        .afterClosed(),
    );
    if (confirmed) await this.facade.active(!active);
  }
}
