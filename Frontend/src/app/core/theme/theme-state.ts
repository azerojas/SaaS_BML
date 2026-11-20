import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'lasheo-theme';
const parseTheme = (value: string | null): Theme | null =>
  value === 'light' || value === 'dark' ? value : null;

@Injectable({ providedIn: 'root' })
export class ThemeState {
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly media = this.window?.matchMedia?.('(prefers-color-scheme: dark)');
  private preference: Theme | null = this.readPreference();
  private readonly current = signal<Theme>(this.resolve());
  readonly dark = computed(() => this.current() === 'dark');

  constructor() {
    this.apply();
    const systemChanged = () => {
      if (!this.preference) this.apply();
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        this.preference = this.readPreference();
        this.apply();
      }
    };
    this.media?.addEventListener('change', systemChanged);
    this.window?.addEventListener('storage', storageChanged);
    inject(DestroyRef).onDestroy(() => {
      this.media?.removeEventListener('change', systemChanged);
      this.window?.removeEventListener('storage', storageChanged);
    });
  }

  toggle() {
    this.preference = this.dark() ? 'light' : 'dark';
    try {
      this.window?.localStorage.setItem(STORAGE_KEY, this.preference);
    } catch {
      // Keep the selected theme for this session if storage is unavailable.
    }
    this.apply();
  }

  private readPreference() {
    try {
      return parseTheme(this.window?.localStorage.getItem(STORAGE_KEY) ?? null);
    } catch {
      return null;
    }
  }

  private resolve(): Theme {
    return this.preference ?? (this.media?.matches ? 'dark' : 'light');
  }

  private apply() {
    const theme = this.resolve();
    this.current.set(theme);
    this.document.documentElement.dataset['theme'] = theme;
    this.document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#191512' : '#fff8f3');
  }
}
