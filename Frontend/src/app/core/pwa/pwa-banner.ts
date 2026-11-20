import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { PwaState } from './pwa-state';
import { UnsavedForms } from '../forms/unsaved-state';
@Component({
  selector: 'bm-pwa-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (state.blocked()) {
    <section role="alert" class="pwa-banner">
      <h2>{{ !state.online() ? 'Sin conexión' : 'Actualización necesaria' }}</h2>
      <p>
        {{
          !state.online()
            ? 'No se pueden registrar pagos, reservas ni llegadas sin conexión. Los campos permanecen en esta pestaña; no se guardan fuera de línea.'
            : 'Hay una versión nueva o una actualización incompleta. Recarga antes de registrar operaciones.'
        }}
      </p>
      @if (state.online()) {
        <button type="button" (click)="reload()">Recargar versión segura</button>
      }
    </section>
  }`,
  styles:
    '.pwa-banner{position:relative;z-index:100;padding:1rem 2rem;background:var(--surface-low);color:var(--ink);border-bottom:2px solid var(--forest)}.pwa-banner h2{font-size:1.1rem}.pwa-banner button{min-height:44px;padding:.5rem 1rem}',
})
export class PwaBanner {
  readonly state = inject(PwaState);
  private readonly forms = inject(UnsavedForms);
  reload() {
    if (
      window.confirm(
        'Se recargará la aplicación. Revisa las operaciones pendientes y guarda tus cambios antes de continuar.',
      ) &&
      this.forms.confirmDiscard()
    )
      location.reload();
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent) {
    if (this.forms.dirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
