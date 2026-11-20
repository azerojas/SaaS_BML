import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/auth-guards';
export const AGENDA_ROUTES: Routes = [
  {
    path: 'mis-fechas',
    canActivate: [permissionGuard],
    data: {
      permissions: [
        'agenda.view_agenda',
        'agenda.manage_professionals',
        'agenda.assign_users',
        'agenda.manage_schedules',
      ],
    },
    loadComponent: () =>
      import('./presentation/personal-availability-page').then((m) => m.PersonalAvailabilityPage),
  },
  {
    path: 'solicitudes',
    canActivate: [permissionGuard],
    data: { permission: 'agenda.view_agenda' },
    loadComponent: () => import('./presentation/requests-page').then((m) => m.RequestsPage),
  },
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./presentation/personal-availability-page').then((m) => m.PersonalAvailabilityPage),
  },
  {
    path: 'citas/nueva',
    canActivate: [permissionGuard],
    data: { permission: 'agenda.manage_appointments' },
    loadComponent: () => import('./presentation/booking-page').then((m) => m.BookingPage),
  },
  {
    path: 'citas/:id',
    loadComponent: () => import('./presentation/appointment-page').then((m) => m.AppointmentPage),
  },
  {
    path: 'profesionales',
    canActivate: [permissionGuard],
    data: { permission: 'agenda.view_agenda' },
    loadComponent: () =>
      import('./presentation/professionals-page').then((m) => m.ProfessionalsPage),
  },
  {
    path: 'bloqueos',
    loadComponent: () => import('./presentation/blocks-page').then((m) => m.BlocksPage),
  },
  {
    path: 'lista-espera',
    loadComponent: () => import('./presentation/waitlist-page').then((m) => m.WaitlistPage),
  },
  {
    path: 'lista-espera/:id',
    loadComponent: () => import('./presentation/waitlist-page').then((m) => m.WaitlistPage),
  },
  {
    path: 'configuracion',
    loadComponent: () =>
      import('./presentation/configuration-page').then((m) => m.ConfigurationPage),
  },
];
