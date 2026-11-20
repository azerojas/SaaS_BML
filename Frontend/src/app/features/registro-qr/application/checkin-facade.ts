import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { ApiFailure } from '../../../core/http/api-failure';
import { RecordState } from '../../../shared/application/operation-state';
import { CheckinApi } from '../infrastructure/checkin-api';
import { CheckinConfig, CheckinInput, CheckinState } from '../domain/checkin';
@Injectable()
export class CheckinFacade extends RecordState<CheckinConfig> {
  private readonly api = inject(CheckinApi);
  readonly state = signal<CheckinState>('idle');
  readonly cooldown = signal(0);
  constructor() {
    super();
    interval(1000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.cooldown() > 0) this.cooldown.update((value) => value - 1);
      });
  }
  async get(token: string) {
    this.cooldown.set(0);
    this.record.set(null);
    this.loading.set(true);
    const result = await this.run(this.api.config(token));
    this.record.set(result);
    this.loading.set(false);
    if (result) this.state.set('idle');
    else {
      this.state.set(
        this.failure()?.status === 429
          ? 'rate_limited'
          : this.failure()?.status === 404
            ? 'expired'
            : 'error',
      );
      if (this.failure()?.status === 429) this.cooldown.set(this.failure()?.retryAfter ?? 60);
    }
  }
  async submit(token: string, input: CheckinInput) {
    if (this.busy() || this.cooldown() > 0 || this.state() === 'received') return;
    this.state.set('submitting');
    const result = await this.run(this.api.submit(token, input));
    if (result) {
      this.state.set('received');
      this.success.set(
        'Si los datos son válidos y tu ficha está habilitada, tu visita queda registrada automáticamente. Si es tu primera visita, completa tus datos y acepta el aviso.',
      );
    } else {
      const error: ApiFailure | null = this.failure();
      this.state.set(
        error?.status === 429 ? 'rate_limited' : error?.status === 404 ? 'expired' : 'error',
      );
      if (error?.status === 429) this.cooldown.set(error.retryAfter ?? 60);
    }
  }
}
