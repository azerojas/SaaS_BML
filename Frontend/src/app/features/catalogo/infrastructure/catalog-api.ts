import { inject, Injectable } from '@angular/core';
import { ResourceApi } from '../../../shared/infrastructure/resource-api';
import { Query } from '../../../shared/domain/records';
import { CatalogImage, CatalogRecord, Kind, Recipe, Stock } from '../domain/catalog';
const BASE = '/api/admin/catalogo/';
@Injectable({ providedIn: 'root' })
export class CatalogApi {
  private readonly api = inject(ResourceApi);
  list(kind: Kind, query: Query) {
    return this.api.list<CatalogRecord>(BASE + kind + '/', query);
  }
  get(kind: Kind, id: number) {
    return this.api.get<CatalogRecord>(BASE + kind + '/' + id + '/');
  }
  save(kind: Kind, data: unknown, id?: number) {
    return this.api.write<CatalogRecord>(
      id ? 'PATCH' : 'POST',
      BASE + kind + '/' + (id ? id + '/' : ''),
      data,
    );
  }
  active(kind: Kind, id: number, active: boolean) {
    return this.api.write<CatalogRecord>(
      'POST',
      BASE + kind + '/' + id + '/' + (active ? 'reactivar' : 'desactivar') + '/',
    );
  }
  recipe(id: number) {
    return this.api.get<Recipe>(BASE + 'servicios/' + id + '/receta/');
  }
  saveRecipe(id: number, insumos: readonly { articulo_id: number; cantidad_estimada: string }[]) {
    return this.api.write<Recipe>('PUT', BASE + 'servicios/' + id + '/receta/', { insumos });
  }
  images(kind: 'servicios' | 'articulos', id: number, query: Query) {
    return this.api.list<CatalogImage>(BASE + kind + '/' + id + '/imagenes/', query);
  }
  addImage(kind: 'servicios' | 'articulos', id: number, data: unknown) {
    return this.api.write<CatalogImage>('POST', BASE + kind + '/' + id + '/imagenes/', data);
  }
  editImage(id: number, data: unknown) {
    return this.api.write<CatalogImage>('PATCH', BASE + 'imagenes/' + id + '/', data);
  }
  primary(id: number) {
    return this.api.write<CatalogImage>('POST', BASE + 'imagenes/' + id + '/principal/');
  }
  deleteImage(id: number) {
    return this.api.write<null>('DELETE', BASE + 'imagenes/' + id + '/');
  }
  stock(id: number) {
    return this.api.list<Stock>(BASE + 'stock/', { articulo: id });
  }
  config() {
    return this.api.config();
  }
}
