import { DestroyRef, Directive, HostListener, inject } from '@angular/core';
import { FormGroupDirective } from '@angular/forms';
import { UnsavedForms } from './unsaved-state';
export { UnsavedForms, unsavedNavigationGuard } from './unsaved-state';
@Directive({ selector: 'form[bmUnsavedForm]' })
export class UnsavedForm {
  private readonly form = inject(FormGroupDirective);
  private readonly registry = inject(UnsavedForms);
  constructor() {
    this.registry.forms.add(this.form);
    inject(DestroyRef).onDestroy(() => {
      this.registry.forms.delete(this.form);
      if (this.registry.submitted === this.form) this.registry.submitted = null;
    });
  }
  @HostListener('submit') submit() {
    this.registry.submitted = this.form;
  }
}
