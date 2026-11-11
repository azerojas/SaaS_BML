import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EmptyState } from '../../shared/ui/empty-state';
@Component({
  selector: 'bm-denied-page',
  imports: [EmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template:
    '<bm-empty-state title="Este espacio necesita otro permiso." description="Tu sesión sigue activa. Si necesitas entrar a este módulo, contacta a la persona administradora para revisar tu acceso." icon="shield" eyebrow="ACCESO RESTRINGIDO"/>',
})
export class DeniedPage {}
