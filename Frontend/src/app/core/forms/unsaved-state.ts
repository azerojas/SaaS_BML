import { inject, Injectable } from '@angular/core';
import type { FormGroupDirective } from '@angular/forms';
import type { CanActivateChildFn } from '@angular/router';
@Injectable({ providedIn: 'root' })
export class UnsavedForms {
  readonly forms = new Set<FormGroupDirective>();
  submitted: FormGroupDirective | null = null;
  dirty() {
    return [...this.forms].some((form) => form.form.dirty);
  }
  confirmDiscard() {
    if (!this.dirty()) return true;
    if (!window.confirm('Hay cambios sin guardar. ¿Quieres salir y descartarlos?')) return false;
    this.forms.forEach((form) => form.form.markAsPristine());
    return true;
  }
  success(form: FormGroupDirective | null = this.submitted) {
    form?.form.markAsPristine();
    if (this.submitted === form) this.submitted = null;
  }
}
export const unsavedNavigationGuard: CanActivateChildFn = () =>
  inject(UnsavedForms).confirmDiscard();
