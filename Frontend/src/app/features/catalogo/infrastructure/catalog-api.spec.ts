import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXsrfConfiguration } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { CatalogApi } from './catalog-api';
import { ClientasApi } from '../../clientas/infrastructure/clientas-api';
describe('contratos HTTP reales tipados', () => {
  let http: HttpTestingController;
  let api: CatalogApi;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withXsrfConfiguration({ cookieName: 'csrftoken', headerName: 'X-CSRFToken' }),
        ),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(CatalogApi);
  });
  afterEach(() => http.verify());
  it('página de artículos usa filtros de servidor, no descarga un catálogo gigante', () => {
    api.list('articulos', { page: 2, page_size: 20, search: 'crema', tipo: 'AMBOS' }).subscribe();
    const request = http.expectOne((r) => r.url === '/api/admin/catalogo/articulos/');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('tipo')).toBe('AMBOS');
    request.flush({ count: 0, next: null, previous: null, results: [] });
  });
  it('PATCH conserva decimales exactos y obtiene CSRF antes de mutar', () => {
    api.save('servicios', { precio_base: '80.10' }, 7).subscribe();
    http.expectOne('/api/auth/csrf/').flush({});
    const request = http.expectOne('/api/admin/catalogo/servicios/7/');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ precio_base: '80.10' });
    request.flush({ id: 7, nombre: 'Servicio' });
  });
  it('reemplaza receta atómicamente y no llama movimientos de inventario', () => {
    api.saveRecipe(7, [{ articulo_id: 3, cantidad_estimada: '0.125' }]).subscribe();
    http.expectOne('/api/auth/csrf/').flush({});
    const request = http.expectOne('/api/admin/catalogo/servicios/7/receta/');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body.insumos[0].cantidad_estimada).toBe('0.125');
    request.flush({ servicio_id: 7, insumos: [], costo_estimado: null, moneda: 'PEN' });
  });
  it('consentimiento no envía una fecha impuesta por el navegador', () => {
    TestBed.inject(ClientasApi)
      .consent(1, { otorgado: true, evidencia: 'Referencia', version_aviso: 'v1' })
      .subscribe();
    http.expectOne('/api/auth/csrf/').flush({});
    const request = http.expectOne('/api/clientas/1/consentimiento/');
    expect(request.request.body).not.toHaveProperty('consentimiento_fecha');
    request.flush({ id: 1 });
  });
});
