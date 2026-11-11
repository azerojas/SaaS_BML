import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ClientasFacade } from '../application/clientas-facade';
import { CLIENTA_FIELDS, phone } from '../domain/clienta';
import { buildFields, EditorFields } from '../../../shared/ui/editor-fields';
import { Alert } from '../../../shared/ui/alert';
import { Loading } from '../../../shared/ui/loading';
import { Button } from '../../../shared/ui/button';
@Component({
  selector: 'bm-clienta-form',
  imports: [RouterLink, ReactiveFormsModule, MatButtonModule, EditorFields, Alert, Loading, Button],
  providers: [ClientasFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<a class="back-link" routerLink="/admin/clientas">← Clientas</a>
    <header class="feature-heading">
      <div>
        <p class="eyebrow">INFORMACIÓN PERSONAL</p>
        <h1>{{ id ? 'Editar clienta' : 'Nueva clienta' }}</h1>
        <p>Datos privados, accesibles solo para el equipo autorizado.</p>
      </div>
    </header>
    @if (facade.loading()) {
      <bm-loading />
    } @else {
      <form class="surface editor" [formGroup]="form" (ngSubmit)="save()">
        @if (facade.error(); as error) {
          <bm-alert [message]="error" />
        }
        <bm-editor-fields [fields]="fields" [form]="form" [errors]="facade.fields()" />
        <p class="muted">
          El consentimiento se registra explícitamente en la ficha después de guardar. La fecha la
          establece Django. No se crean contraseñas para las clientas.
        </p>
        <div class="form-actions">
          <a mat-button routerLink="/admin/clientas">Cancelar</a
          ><bm-button type="submit" [busy]="facade.busy()">Guardar clienta</bm-button>
        </div>
      </form>
    }`,
})
export class ClientaForm {
  readonly facade = inject(ClientasFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly id = Number(this.route.snapshot.paramMap.get('id')) || undefined;
  readonly fields = CLIENTA_FIELDS;
  readonly form = buildFields(this.fields);
  constructor() {
    this.form.controls['telefono'].addValidators((control) =>
      phone(String(control.value)) ? null : { phone: true },
    );
    this.form.controls['fecha_nacimiento'].addValidators((control) =>
      control.value && String(control.value) > new Date().toISOString().slice(0, 10)
        ? { future: true }
        : null,
    );
    void this.init();
  }
  private async init() {
    if (this.id) {
      await this.facade.loadClient(this.id);
      const c = this.facade.record();
      if (c)
        this.form.patchValue({
          nombres: c.nombres,
          apellidos: c.apellidos,
          telefono: c.telefono,
          email: c.email ?? '',
          fecha_nacimiento: c.fecha_nacimiento ?? '',
          notas_privadas: c.notas_privadas ?? '',
        });
    }
  }
  async save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const result = await this.facade.save(
      {
        ...raw,
        nombres: String(raw['nombres']).trim(),
        apellidos: String(raw['apellidos']).trim(),
        telefono: phone(String(raw['telefono'])),
        email: raw['email'] || null,
        fecha_nacimiento: raw['fecha_nacimiento'] || null,
      },
      this.id,
    );
    if (result) await this.router.navigate(['/admin/clientas', result.id]);
  }
}
