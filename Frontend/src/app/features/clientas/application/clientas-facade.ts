import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RecordState } from '../../../shared/application/operation-state';
import { PagedState } from '../../../shared/application/paged-state';
import { PresentationConfig, messageOf } from '../../../shared/domain/records';
import { Clienta } from '../domain/clienta';
import { ClientasApi } from '../infrastructure/clientas-api';
@Injectable()
export class ClientasFacade extends RecordState<Clienta> {
  private readonly api = inject(ClientasApi);
  readonly list = new PagedState((query) => this.api.list(query), false);
  readonly config = signal<PresentationConfig | null>(null);
  loadClient(id: number) {
    return this.load(this.api.get(id));
  }
  async configure() {
    try {
      this.config.set(await firstValueFrom(this.api.config()));
    } catch (error: unknown) {
      this.error.set(messageOf(error));
    }
  }
  async save(data: unknown, id?: number) {
    const saved = await this.run(this.api.save(data, id));
    if (saved) this.record.set(saved);
    return saved;
  }
  async active(active: boolean) {
    const id = this.record()?.id;
    if (!id) return;
    const saved = await this.run(this.api.active(id, active));
    if (saved) {
      this.record.set(saved);
      this.success.set('Estado actualizado.');
    }
  }
  async consent(data: { otorgado: boolean; evidencia: string; version_aviso: string }) {
    const id = this.record()?.id;
    if (!id) return false;
    const saved = await this.run(this.api.consent(id, data));
    if (saved) {
      this.record.set(saved);
      this.success.set('Consentimiento registrado por el servidor.');
    }
    return !!saved;
  }
}
