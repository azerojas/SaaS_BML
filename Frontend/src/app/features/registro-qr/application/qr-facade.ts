import { inject, Injectable, signal } from '@angular/core';
import { OperationState } from '../../../shared/application/operation-state';
import { PagedState } from '../../../shared/application/paged-state';
import { CheckinApi } from '../infrastructure/checkin-api';
import { QrPoint } from '../domain/checkin';
@Injectable()
export class QrFacade extends OperationState {
  private readonly api = inject(CheckinApi);
  readonly list = new PagedState((query) => this.api.points(query));
  readonly selected = signal<{ id: number; nombre: string; url: string; ready: boolean } | null>(
    null,
  );
  async save(body: { nombre?: string; activo?: boolean }, id?: number) {
    const result = await this.run(this.api.savePoint(body, id));
    if (result) {
      this.selected.set(null);
      this.list.reload();
      this.success.set('Punto QR guardado.');
    }
    return result;
  }
  async show(point: QrPoint) {
    const result = await this.run(this.api.qr(point.id));
    if (!result) return;
    try {
      const url = new URL(result.enlace);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
      this.selected.set({
        id: point.id,
        nombre: point.nombre,
        url: url.href,
        ready:
          /^\/registro\/[^/]+\/$/.test(url.pathname) || /^\/registro\/[^/]+$/.test(url.pathname),
      });
    } catch {
      this.error.set(
        'Configura PUBLIC_CHECKIN_URL con la URL HTTPS del formulario Angular /registro/. El QR no se puede imprimir todavía.',
      );
    }
  }
}
