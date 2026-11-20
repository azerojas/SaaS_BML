import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { SessionStore } from '../application/session-store';
import { safeReturnUrl } from '../domain/session';
import { TextField } from '../../../shared/ui/text-field';
import { Button } from '../../../shared/ui/button';
import { Alert } from '../../../shared/ui/alert';
import { Icon } from '../../../shared/ui/icon';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';

@Component({
  selector: 'bm-login-page',
  imports: [ReactiveFormsModule, MatButtonModule, TextField, Button, Alert, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  readonly recoveryMode = signal(false);
  readonly form = new FormGroup({
    username: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(150)],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(4096)],
    }),
  });
  readonly mfa = new FormGroup({
    code: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^(?:\d{6}|[A-Za-z0-9_-]{24,128})$/)],
    }),
  });

  async submit() {
    if (this.form.invalid || this.session.isBusy()) {
      this.form.markAllAsTouched();
      return;
    }
    const { username, password } = this.form.getRawValue();
    const loggedIn = await this.session.login(username.trim(), password);
    this.form.controls.password.reset();
    if (loggedIn) await this.enter();
  }
  async verify() {
    if (this.mfa.invalid || this.session.isBusy()) {
      this.mfa.markAllAsTouched();
      return;
    }
    const loggedIn = await this.session.verify(this.mfa.controls.code.value.trim());
    this.mfa.reset();
    if (loggedIn && !this.session.recoveryCodes().length) await this.enter();
  }
  async enter() {
    this.session.clearRecoveryCodes();
    if (!this.session.isAuthenticated()) await this.session.restore(true);
    if (this.session.isAuthenticated())
      await this.router.navigateByUrl(
        safeReturnUrl(
          this.route.snapshot.queryParamMap.get('returnUrl') ||
            (this.session.hasPermission('agenda.view_own_agenda') &&
            !this.session.hasPermission('agenda.view_agenda')
              ? '/admin/agenda'
              : '/admin'),
        ),
        { replaceUrl: true },
      );
  }
  downloadCodes() {
    const blob = new Blob(
      [
        'Lasheo · códigos de recuperación. Guarda este archivo en privado.\n\n' +
          this.session.recoveryCodes().join('\n'),
      ],
      { type: 'text/plain' },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'lasheo-recuperacion.txt';
    anchor.click();
    URL.revokeObjectURL(url);
  }
  help() {
    this.dialog.open(ConfirmDialog, {
      width: '420px',
      maxWidth: '92vw',
      data: {
        title: 'Estamos para ayudarte',
        description:
          'Si no recuerdas tu acceso o perdiste el autenticador, contacta a la persona administradora de tu salón. La recuperación de acceso se gestiona de forma privada.',
        confirm: 'Entendido',
      },
    });
  }
}
