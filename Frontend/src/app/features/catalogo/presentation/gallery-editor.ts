import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { SessionStore } from '../../../core/auth/application/session-store';
import { CatalogImage } from '../domain/catalog';
import { GalleryFacade } from '../application/gallery-facade';
import { Field, safeHttps } from '../../../shared/domain/records';
import { buildFields, EditorFields } from '../../../shared/ui/editor-fields';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Button } from '../../../shared/ui/button';
import { Pager } from '../../../shared/ui/pager';
@Component({
  selector: 'bm-gallery-editor',
  imports: [ReactiveFormsModule, MatButtonModule, EditorFields, Alert, Loading, Button, Pager],
  providers: [GalleryFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="surface section-gap">
    <h2>Fotografías</h2>
    <p class="muted">
      Referencias por URL HTTPS. Esta API no sube archivos. Cada fotografía pertenece únicamente a
      esta ficha.
    </p>
    @if (facade.error(); as error) {
      <bm-alert [message]="error" />
    }
    @if (localError(); as error) {
      <bm-alert [message]="error" />
    }
    @if (facade.success(); as success) {
      <bm-alert kind="info" [message]="success" />
    }
    @if (!facade.config()?.image_allowed_hosts?.length) {
      <div class="empty-panel">
        <h3>Almacenamiento de imágenes pendiente</h3>
        <p>
          Django no tiene dominios de imágenes autorizados. Podrás añadir URLs cuando administración
          configure un proveedor; no se aceptan enlaces arbitrarios de internet.
        </p>
      </div>
    } @else if (canAdd() || editing()) {
      <form [formGroup]="form" (ngSubmit)="save()">
        <bm-editor-fields
          prefix="image-"
          [fields]="fields"
          [form]="form"
          [errors]="facade.fields()"
        />
        <p class="muted">
          Dominios autorizados: {{ facade.config()?.image_allowed_hosts?.join(', ') }}
        </p>
        <div class="form-actions">
          @if (editing()) {
            <button mat-button type="button" (click)="reset()">Cancelar edición</button>
          }
          <bm-button type="submit" [busy]="facade.busy()">{{
            editing() ? 'Guardar fotografía' : 'Añadir fotografía'
          }}</bm-button>
        </div>
      </form>
    }
    @if (facade.list.error(); as error) {
      <bm-alert [message]="error" /><button mat-button (click)="facade.list.reload()">
        Reintentar fotografías
      </button>
    }
    @if (facade.list.loading()) {
      <bm-loading />
    } @else {
      <div class="gallery-grid">
        @for (image of facade.list.rows(); track image.id) {
          <article class="image-card">
            @if (imageUrl(image); as url) {
              <img
                [src]="url"
                [alt]="image.texto_alt || 'Fotografía del catálogo'"
                loading="lazy"
                referrerpolicy="no-referrer"
                (error)="imageFailed(image.id)"
              />
            } @else {
              <div class="image-placeholder">Fotografía no disponible</div>
            }
            <p>{{ image.texto_alt || 'Sin texto alternativo' }}</p>
            <small
              >Orden {{ image.orden }} ·
              {{ image.es_principal ? 'Principal' : 'Secundaria' }}</small
            >
            <div class="form-actions">
              @if (session.hasPermission('negocio.change_imagenescatalogo')) {
                <button mat-button type="button" [disabled]="facade.busy()" (click)="edit(image)">
                  Editar fotografía
                </button>
                @if (!image.es_principal) {
                  <button
                    mat-button
                    type="button"
                    [disabled]="facade.busy()"
                    (click)="facade.primary(image.id)"
                  >
                    Hacer principal
                  </button>
                }
              }
              @if (session.hasPermission('negocio.delete_imagenescatalogo')) {
                <button
                  mat-button
                  type="button"
                  [disabled]="facade.busy()"
                  (click)="remove(image.id)"
                >
                  Retirar fotografía
                </button>
              }
            </div>
          </article>
        } @empty {
          <p class="muted">Sin fotografías registradas.</p>
        }
      </div>
    }
    <bm-pager
      [count]="facade.list.count()"
      [page]="page()"
      [busy]="facade.list.loading()"
      (changed)="facade.list.page($event)"
    />
  </section>`,
})
export class GalleryEditor implements OnInit {
  readonly facade = inject(GalleryFacade);
  readonly session = inject(SessionStore);
  private readonly dialog = inject(MatDialog);
  readonly kind = input.required<'servicios' | 'articulos'>();
  readonly parentId = input.required<number>();
  readonly editing = signal<number | null>(null);
  readonly localError = signal<string | null>(null);
  readonly failed = signal<readonly number[]>([]);
  readonly fields: readonly Field[] = [
    { key: 'url', label: 'URL HTTPS de la fotografía', required: true, max: 500 },
    { key: 'texto_alt', label: 'Texto alternativo', required: true, max: 200 },
    { key: 'orden', label: 'Orden de la fotografía' },
  ];
  readonly form = buildFields(this.fields, { orden: '0' });
  ngOnInit() {
    void this.facade.configure(this.kind(), this.parentId());
  }
  canAdd() {
    return (
      this.session.hasPermission('negocio.add_imagenescatalogo') &&
      this.session.hasPermission('negocio.change_' + this.kind())
    );
  }
  page() {
    return Number(this.facade.list.query()['page']);
  }
  imageUrl(image: CatalogImage) {
    if (this.failed().includes(image.id)) return null;
    const url = safeHttps(image.url);
    return url && this.facade.config()?.image_allowed_hosts.includes(new URL(url).hostname)
      ? url
      : null;
  }
  imageFailed(id: number) {
    this.failed.update((values) => [...values, id]);
  }
  edit(image: CatalogImage) {
    this.editing.set(image.id);
    this.form.patchValue({
      url: image.url,
      texto_alt: image.texto_alt ?? '',
      orden: String(image.orden),
    });
  }
  reset() {
    this.editing.set(null);
    this.form.reset({ orden: '0', url: '', texto_alt: '' });
  }
  async save() {
    this.localError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const url = safeHttps(String(raw['url']));
    if (!url || !this.facade.config()?.image_allowed_hosts.includes(new URL(url).hostname)) {
      this.localError.set('Usa una URL HTTPS de un dominio autorizado por Django.');
      return;
    }
    if (!/^\d{1,10}$/.test(String(raw['orden'])) || Number(raw['orden']) > 2147483647) {
      this.localError.set('El orden debe ser un entero no negativo.');
      return;
    }
    if (
      await this.facade.save(
        { ...raw, url, orden: Number(raw['orden']) },
        this.editing() ?? undefined,
      )
    )
      this.reset();
  }
  async remove(id: number) {
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialog, {
          data: {
            title: '¿Retirar fotografía?',
            description:
              'Se elimina la referencia; si era principal, el servidor seleccionará otra de las restantes.',
            confirm: 'Retirar fotografía',
          },
        })
        .afterClosed(),
    );
    if (confirmed) await this.facade.remove(id);
  }
}
