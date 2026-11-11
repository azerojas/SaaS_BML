import { inject, Injectable } from '@angular/core';
import { RecordState } from '../../../shared/application/operation-state';
import { CatalogApi } from '../infrastructure/catalog-api';
import { Recipe } from '../domain/catalog';
@Injectable()
export class MaterialsFacade extends RecordState<Recipe> {
  private readonly api = inject(CatalogApi);
  get(id: number) {
    return this.load(this.api.recipe(id));
  }
  async save(id: number, insumos: readonly { articulo_id: number; cantidad_estimada: string }[]) {
    const saved = await this.run(this.api.saveRecipe(id, insumos));
    if (saved) {
      this.record.set(saved);
      this.success.set('Receta guardada. No se modificó el inventario.');
    }
    return !!saved;
  }
}
