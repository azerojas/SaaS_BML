import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { Icon } from './icon';

@Component({
  selector: 'bm-text-field',
  host: { '[attr.id]': 'null' },
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<label class="field-label" [for]="id()">{{ label() }}</label
    ><mat-form-field appearance="outline" subscriptSizing="dynamic"
      ><input
        matInput
        [id]="id()"
        [type]="inputType()"
        [formControl]="control()"
        [autocomplete]="autocomplete()"
        [placeholder]="placeholder()"
        [attr.inputmode]="inputMode()"
        [attr.maxlength]="maxLength()"
        [attr.aria-label]="label()"
      />
      @if (type() === 'password') {
        <button
          mat-icon-button
          matSuffix
          type="button"
          [attr.aria-label]="visible() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
          [attr.aria-pressed]="visible()"
          (click)="visible.set(!visible())"
        >
          <bm-icon name="eye" />
        </button>
      }
      @if (control().hasError('required')) {
        <mat-error>Este campo es obligatorio.</mat-error>
      } @else if (control().hasError('maxlength')) {
        <mat-error>El contenido es demasiado largo.</mat-error>
      } @else if (control().invalid) {
        <mat-error>Revisa el formato de este campo.</mat-error>
      }
    </mat-form-field>`,
  styles:
    ':host{display:block;margin-bottom:1.3rem}.field-label{display:block;font-size:.82rem;font-weight:650;margin-bottom:.55rem;color:var(--ink)}mat-form-field{width:100%}input{font-size:.91rem}button{margin-right:.3rem}',
})
export class TextField {
  readonly control = input.required<FormControl<string>>();
  readonly id = input.required<string>();
  readonly label = input.required<string>();
  readonly type = input<'text' | 'password'>('text');
  readonly autocomplete = input('off');
  readonly placeholder = input('');
  readonly inputMode = input('text');
  readonly maxLength = input(150);
  readonly visible = signal(false);
  readonly inputType = computed(() =>
    this.type() === 'password' && !this.visible() ? 'password' : 'text',
  );
}
