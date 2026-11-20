import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { SessionStore } from '../../../core/auth/application/session-store';
import { ClientasFacade } from '../application/clientas-facade';
import { Field, safeNotice } from '../../../shared/domain/records';
import { buildFields } from '../../../shared/ui/editor-fields';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Button } from '../../../shared/ui/button';
import { Icon } from '../../../shared/ui/icon';
import { ClientaForm } from './clienta-form';
import { Clienta } from '../domain/clienta';
@Component({
  selector: 'bm-clienta-detail',
  imports: [RouterLink, ReactiveFormsModule, MatButtonModule, Alert, Loading, Button, Icon],
  providers: [ClientasFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './clienta-detail.html',
  styleUrl: './clienta-detail.scss',
})
export class ClientaDetail {
  readonly facade = inject(ClientasFacade);
  readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  readonly consentFields: readonly Field[] = [
    {
      key: 'otorgado',
      label: 'La clienta otorga consentimiento para tratar sus datos',
      type: 'checkbox',
    },
    {
      key: 'evidencia',
      label: 'Referencia de la evidencia',
      required: true,
      max: 500,
      hint: 'Referencia no sensible del consentimiento o retiro. No copies documentos personales.',
    },
  ];
  readonly consent = buildFields(this.consentFields);
  initials(first: string, last: string) {
    return ((first.trim()[0] || '') + (last.trim()[0] || '')).toUpperCase();
  }
  displayDate(value?: string | null, dateOnly = false) {
    if (!value) return 'Sin registrar';
    const date = new Date(dateOnly ? value + 'T12:00:00Z' : value);
    if (!Number.isFinite(date.getTime())) return 'Sin registrar';
    return new Intl.DateTimeFormat('es-PE', {
      dateStyle: 'long',
      ...(dateOnly ? {} : { timeStyle: 'short' as const }),
      timeZone: 'America/Lima',
    }).format(date);
  }
  constructor() {
    void this.facade.loadClient(Number(this.route.snapshot.paramMap.get('id')));
    void this.facade.configure();
  }
  canEdit() {
    return this.session.hasPermission('negocio.change_clientas');
  }
  async edit() {
    const client = this.facade.record();
    if (!client || !this.canEdit() || this.facade.busy()) return;
    const saved = await firstValueFrom(
      this.dialog
        .open<ClientaForm, Clienta, Clienta>(ClientaForm, {
          data: client,
          width: '760px',
          maxWidth: 'calc(100vw - 24px)',
          autoFocus: 'first-heading',
          closePredicate: (_result, _config, instance) =>
            !(instance instanceof ClientaForm && instance.facade.busy()),
        })
        .afterClosed(),
    );
    if (saved) {
      this.facade.record.set(saved);
      this.facade.success.set('Ficha actualizada.');
    }
  }
  noticeUrl() {
    return safeNotice(this.facade.config()?.privacy_notice.url, location.origin);
  }
  async toggle() {
    const c = this.facade.record();
    if (!c) return;
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialog, {
          data: {
            title: c.activa ? '¿Desactivar clienta?' : '¿Reactivar clienta?',
            description: 'Se conservarán su ficha y todas las referencias históricas.',
            confirm: c.activa ? 'Desactivar' : 'Reactivar',
          },
        })
        .afterClosed(),
    );
    if (confirmed) await this.facade.active(!c.activa);
  }
  async saveConsent() {
    if (this.consent.invalid) {
      this.consent.markAllAsTouched();
      return;
    }
    const version = this.facade.config()?.privacy_notice.version;
    if (!version) return;
    const raw = this.consent.getRawValue();
    await this.facade.consent({
      otorgado: raw['otorgado'] === true,
      evidencia: String(raw['evidencia']).trim(),
      version_aviso: version,
    });
  }
}
