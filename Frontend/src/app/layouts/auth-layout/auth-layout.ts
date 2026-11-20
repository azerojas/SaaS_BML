import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Brand } from '../../shared/ui/brand';
import { Icon } from '../../shared/ui/icon';
import { ThemeToggle } from '../../shared/ui/theme-toggle';

@Component({
  selector: 'bm-auth-layout',
  imports: [RouterOutlet, Brand, Icon, ThemeToggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="auth-shell">
    <aside class="story" aria-label="Beauty Manager">
      <a class="brand-link" href="/login" aria-label="Lasheo, inicio"
        ><bm-brand [compact]="false"
      /></a>
      <div class="story-content">
        <span class="eyebrow">EL CUIDADO EMPIEZA AQUÍ</span>
        <h2>Tu talento.<br />Tu espacio.<br /><span>Todo en armonía.</span></h2>
        <p>
          Una forma más simple de acompañar<br class="desktop-break" />
          cada día de tu salón.
        </p>
      </div>
      <div class="botanical" aria-hidden="true">
        <svg viewBox="0 0 430 400">
          <path
            d="M210 390C200 240 230 130 330 35M220 300C110 290 75 210 65 145c90 0 150 70 155 155ZM235 230c90-5 140-60 150-120-85-10-140 40-150 120ZM255 165c-50-35-60-100-30-150 60 40 65 100 30 150ZM209 357C93 355 35 302 15 240c110-10 180 35 194 117Z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
          />
          <path
            d="M210 390C201 300 139 224 65 145m144 212C120 285 61 262 15 240m220-10c70-70 102-95 150-120M255 165c-5-60-17-105-30-150"
            fill="none"
            stroke="currentColor"
            stroke-width="1"
          />
        </svg>
      </div>
      <footer><span class="tiny-mark">✳</span> Un espacio pensado para lo que haces mejor.</footer>
    </aside>
    <main id="main-content" class="auth-main" tabindex="-1">
      <bm-theme-toggle class="auth-theme-toggle" />
      <div class="mobile-brand"><bm-brand /></div>
      <div class="form-stage"><router-outlet /></div>
      <div class="auth-footer">
        <bm-icon name="shield" /><span>Acceso privado para tu equipo</span
        ><span class="footer-dot">·</span><span>Beauty Manager</span>
      </div>
    </main>
  </div>`,
  styleUrl: './auth-layout.scss',
})
export class AuthLayout {}
