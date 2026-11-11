import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { OperationState } from '../../../shared/application/operation-state';
import { PagedState } from '../../../shared/application/paged-state';
import { PresentationConfig, messageOf } from '../../../shared/domain/records';
import { CatalogApi } from '../infrastructure/catalog-api';
@Injectable()
export class GalleryFacade extends OperationState {
  private readonly api = inject(CatalogApi);
  private kind: 'servicios' | 'articulos' = 'servicios';
  private id = 0;
  readonly list = new PagedState((query) => this.api.images(this.kind, this.id, query), false);
  readonly config = signal<PresentationConfig | null>(null);
  async configure(kind: 'servicios' | 'articulos', id: number) {
    this.kind = kind;
    this.id = id;
    this.list.reload();
    try {
      this.config.set(await firstValueFrom(this.api.config()));
    } catch (error: unknown) {
      this.error.set(messageOf(error));
    }
  }
  async save(data: unknown, id?: number) {
    const saved = await this.run(
      id ? this.api.editImage(id, data) : this.api.addImage(this.kind, this.id, data),
    );
    if (saved) {
      this.success.set('Fotografía guardada.');
      this.list.reload();
    }
    return !!saved;
  }
  async primary(id: number) {
    const saved = await this.run(this.api.primary(id));
    if (saved) {
      this.success.set('Imagen principal actualizada.');
      this.list.reload();
    }
  }
  async remove(id: number) {
    await this.run(this.api.deleteImage(id));
    if (!this.error()) {
      this.success.set('Imagen retirada; Django seleccionó la siguiente principal, si existe.');
      this.list.reload();
    }
  }
}
