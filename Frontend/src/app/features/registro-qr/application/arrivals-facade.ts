import { inject, Injectable } from '@angular/core';
import { RecordState } from '../../../shared/application/operation-state';
import { PagedState } from '../../../shared/application/paged-state';
import { CheckinApi } from '../infrastructure/checkin-api';
import { ArrivalDetail } from '../domain/checkin';
@Injectable()
export class ArrivalsFacade extends RecordState<ArrivalDetail> {
  private readonly api = inject(CheckinApi);
  readonly list = new PagedState((query) => this.api.arrivals(query), false);
  constructor() {
    super();
    this.list.filter({ estado: 'PENDIENTE', vigentes: 'all' });
  }
  get(id: number) {
    return this.load(this.api.arrival(id));
  }
  createVisit(id: number) {
    return this.run(this.api.visit(id));
  }
  async associate(id: number, visit: number) {
    const result = await this.run(this.api.associate(id, visit));
    if (result) await this.get(id);
  }
  async link(id: number, appointment: number) {
    const result = await this.run(this.api.link(id, appointment));
    if (result) await this.get(id);
  }
  async resolve(action: 'confirmar' | 'rechazar' | 'cancelar', body: unknown) {
    const id = this.record()?.id;
    if (!id || this.busy()) return;
    const result = await this.run(this.api.resolve(id, action, body));
    if (result) {
      this.record.set(result);
      this.success.set('Llegada actualizada por recepción.');
    } else {
      const error = this.error();
      const fields = this.fields();
      await this.get(id);
      this.error.set(error);
      this.fields.set(fields);
    }
  }
}
