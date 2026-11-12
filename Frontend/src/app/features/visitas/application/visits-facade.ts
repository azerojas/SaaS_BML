import { inject, Injectable } from '@angular/core';
import { PagedState } from '../../../shared/application/paged-state';
import { RecordState } from '../../../shared/application/operation-state';
import { VisitsApi } from '../infrastructure/visits-api';
import { Visit, VisitInput } from '../domain/visit';
import { FinancialIntent } from '../../ventas/application/financial-intent';
@Injectable()
export class VisitsFacade extends RecordState<Visit> {
  private readonly api = inject(VisitsApi);
  readonly intent = inject(FinancialIntent);
  readonly list = new PagedState((query) => this.api.list(query), false);
  get(id: number) {
    return this.load(this.api.get(id));
  }
  create(body: VisitInput) {
    return this.intent.send('visita.abrir', 'new', '/api/visitas/', body);
  }
  async notes(notas: string) {
    const id = this.record()?.id;
    if (!id) return;
    const result = await this.intent.send(
      'visita.notas',
      String(id),
      '/api/visitas/' + id + '/',
      { notas },
      'PATCH',
    );
    await this.get(id);
    if (result) this.success.set('Notas guardadas.');
  }
  async resolve(action: 'cancelar' | 'finalizar', motivo?: string) {
    const id = this.record()?.id;
    if (!id) return;
    const result = await this.intent.send(
      'visita.' + action,
      String(id),
      '/api/visitas/' + id + '/' + action + '/',
      action === 'cancelar' ? { motivo } : {},
    );
    await this.get(id);
    if (result) this.success.set('Estado de visita confirmado por Django.');
  }
}
