import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
bootstrapApplication(App, appConfig).catch(() => {
  const root = document.querySelector('app-root');
  if (root)
    root.textContent = 'No pudimos cargar tu espacio. Recarga la página para intentarlo de nuevo.';
});
