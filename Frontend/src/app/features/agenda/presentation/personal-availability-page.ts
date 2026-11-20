import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom, retry } from 'rxjs';
import { Alert } from '../../../shared/ui/alert';
import { AgendaApi } from '../infrastructure/agenda-api';
import { Professional } from '../domain/agenda';
import { SessionStore } from '../../../core/auth/application/session-store';
import { CalendarPage } from './calendar-page';

@Component({
  selector: 'bm-personal-availability-page',
  imports: [Alert, CalendarPage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './personal-availability-page.html',
  styles: ':host{display:block;min-width:0}',
})
export class PersonalAvailabilityPage {
  readonly session = inject(SessionStore);
  readonly administrator = [
    'agenda.view_agenda',
    'agenda.manage_professionals',
    'agenda.assign_users',
    'agenda.manage_schedules',
  ].every((permission) => this.session.hasPermission(permission));
  readonly teamView = signal(false);
  private readonly api = inject(AgendaApi);
  readonly profile = signal<Professional | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  constructor() {
    if (this.administrator) void this.load();
    else this.loading.set(false);
  }
  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const profile = await firstValueFrom(
        this.api.resource
          .write<Professional>('POST', this.api.path('profesionales/mi-agenda/'), {})
          .pipe(retry({ count: 1, delay: 250 })),
      );
      this.profile.set(profile);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo cargar tu calendario.');
    } finally {
      this.loading.set(false);
    }
  }
}
