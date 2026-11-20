import { DateField } from '../../shared/ui/date-field';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom, forkJoin } from 'rxjs';
import { ApiFailure } from '../../core/http/api-failure';
import { PwaState } from '../../core/pwa/pwa-state';
import { Alert } from '../../shared/ui/alert';
import { Icon } from '../../shared/ui/icon';
import { limaToday } from '../dashboard/domain/periods';
import { money, localDateTime } from '../dashboard/domain/analytics';
import {
  BookingConfig,
  BookingProfessional,
  BookingService,
  BookingSlots,
  CustomerBooking,
  PublicBookingApi,
} from './public-booking-api';

@Component({
  selector: 'bm-public-booking-page',
  imports: [DateField, ReactiveFormsModule, RouterLink, Alert, Icon],
  templateUrl: './public-booking-page.html',
  styleUrl: './public-booking-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicBookingPage {
  private readonly api = inject(PublicBookingApi);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  readonly pwa = inject(PwaState);
  readonly managing = inject(Router).url.startsWith('/mis-reservas');
  readonly money = money;
  readonly dateTime = localDateTime;
  readonly today = limaToday();
  readonly config = signal<BookingConfig | null>(null);
  readonly services = signal<BookingService[]>([]);
  readonly professionals = signal<BookingProfessional[]>([]);
  readonly selectedServices = signal<number[]>([]);
  readonly chosenServices = computed(() =>
    this.services().filter((service) => this.selectedServices().includes(service.id)),
  );
  readonly eligibleProfessionals = computed(() =>
    this.professionals().filter(
      (p) =>
        this.selectedServices().length > 0 &&
        this.selectedServices().every((id) => p.servicios.includes(id)),
    ),
  );
  readonly available = signal<BookingSlots | null>(null);
  readonly selectedSlot = signal('');
  readonly busy = signal(false);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly message = signal('');
  readonly bookings = signal<CustomerBooking[]>([]);
  readonly completed = signal<CustomerBooking | null>(null);
  readonly changing = signal<CustomerBooking | null>(null);
  readonly cancelling = signal<CustomerBooking | null>(null);
  readonly pending = signal<string | null>(sessionStorage.getItem('lasheo-public-booking-intent'));
  readonly canResume = signal(false);
  readonly accessCode = signal('');
  private pendingPath = '';
  private pendingBody: unknown = null;
  private slotRequest = 0;
  readonly accessForm = this.fb.nonNullable.group({
    telefono: ['', Validators.required],
    codigo: ['', [Validators.required, Validators.pattern(/^\d{8}$/)]],
  });
  readonly slotForm = this.fb.nonNullable.group({
    professional: ['', Validators.required],
    date: [this.today, Validators.required],
  });
  readonly detailsForm = this.fb.nonNullable.group({
    nombres: ['', [Validators.required, Validators.maxLength(120)]],
    apellidos: ['', [Validators.required, Validators.maxLength(120)]],
    telefono: ['', [Validators.required, Validators.maxLength(40)]],
    consent: [false, Validators.requiredTrue],
  });
  readonly changeForm = this.fb.nonNullable.group({ date: [this.today, Validators.required] });
  readonly cancelForm = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(250)]],
  });

  constructor() {
    this.slotForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.invalidateSlots());
    this.changeForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.invalidateSlots());
    void this.load();
  }
  private invalidateSlots() {
    this.slotRequest++;
    this.available.set(null);
    this.selectedSlot.set('');
  }
  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const cfg = await firstValueFrom(this.api.config());
      if (this.destroyRef.destroyed) return;
      this.config.set(cfg);
      if (!this.managing && cfg.habilitada) {
        const data = await firstValueFrom(
          forkJoin({ services: this.api.services(), professionals: this.api.professionals() }),
        );
        if (this.destroyRef.destroyed) return;
        this.services.set(data.services.results);
        this.professionals.set(data.professionals.results);
        const service = Number(this.route.snapshot.queryParamMap.get('servicio'));
        if (service && data.services.results.some((row) => row.id === service))
          this.selectedServices.set([service]);
      }
      const token = this.managing ? window.location.hash.slice(1) : '';
      if (token) {
        await firstValueFrom(this.api.write<CustomerBooking>('acceso/', { token }));
        window.history.replaceState(null, '', window.location.pathname);
      }
      await this.refreshBookings();
    } catch (error) {
      this.showError(error);
    } finally {
      this.loading.set(false);
    }
  }
  toggleService(id: number, checked: boolean) {
    this.selectedServices.update((ids) =>
      checked ? [...ids, id] : ids.filter((item) => item !== id),
    );
    this.slotForm.controls.professional.setValue('');
    this.invalidateSlots();
  }
  async searchSlots() {
    if (this.busy() || this.pending()) return;
    const change = this.changing();
    if (change ? this.changeForm.invalid : this.slotForm.invalid || !this.selectedServices().length)
      return;
    this.invalidateSlots();
    const version = this.slotRequest;
    await this.run(async () => {
      const value = this.slotForm.getRawValue();
      const slots = await firstValueFrom(
        change
          ? this.api.mySlots(change.id, this.changeForm.controls.date.value)
          : this.api.slots(Number(value.professional), this.selectedServices(), value.date),
      );
      if (version === this.slotRequest) this.available.set(slots);
    });
  }
  async openBooking() {
    await this.run(async () => {
      const { telefono, codigo } = this.accessForm.getRawValue();
      await firstValueFrom(this.api.write<CustomerBooking>('acceso/', { telefono, codigo }));
      this.accessForm.reset();
      await this.refreshBookings();
    });
  }
  async logout() {
    await this.run(async () => {
      await firstValueFrom(this.api.write('salir/', {}));
      this.bookings.set([]);
      this.completed.set(null);
      this.accessCode.set('');
      this.accessForm.reset();
      this.changing.set(null);
      this.cancelling.set(null);
    });
  }
  async copyAccessCode() {
    try {
      await navigator.clipboard.writeText(this.accessCode());
      this.message.set('Clave copiada. Guárdala para consultar esta solicitud.');
    } catch {
      this.error.set('No pudimos copiar la clave. Anótala para consultarla más adelante.');
    }
  }
  async reserve() {
    this.detailsForm.markAllAsTouched();
    if (this.detailsForm.invalid || !this.selectedSlot() || this.pending() || this.busy()) return;
    const values = this.detailsForm.getRawValue();
    await this.mutate('solicitudes/', {
      nombres: values.nombres,
      apellidos: values.apellidos,
      telefono: values.telefono,
      consentimiento_datos: values.consent,
      version_aviso: this.config()!.privacy_notice.version,
      servicios: this.selectedServices(),
      profesional_id: Number(this.slotForm.controls.professional.value),
      inicio_en: this.selectedSlot(),
    });
  }
  startChange(booking: CustomerBooking) {
    this.changing.set(booking);
    this.cancelling.set(null);
    this.changeForm.controls.date.setValue(limaToday(new Date(booking.inicio_en)));
    this.invalidateSlots();
  }
  async reschedule() {
    const booking = this.changing();
    if (booking && this.selectedSlot())
      await this.mutate('solicitudes/' + booking.id + '/reprogramar/', {
        inicio_en: this.selectedSlot(),
      });
  }
  async cancel() {
    this.cancelForm.markAllAsTouched();
    const booking = this.cancelling();
    if (booking && this.cancelForm.valid)
      await this.mutate('solicitudes/' + booking.id + '/cancelar/', {
        motivo: this.cancelForm.controls.reason.value,
      });
  }
  private async mutate(path: string, body: unknown) {
    if (this.pending() || this.busy()) return;
    const key = sessionStorage.getItem('lasheo-public-booking-intent') ?? crypto.randomUUID();
    this.pendingPath = path;
    this.pendingBody = body;
    sessionStorage.setItem('lasheo-public-booking-intent', key);
    this.pending.set(key);
    await this.submitPending();
  }
  async submitPending() {
    const key = this.pending();
    if (!key || !this.pendingPath || !this.pendingBody) return;
    await this.run(async () => {
      try {
        await this.success(
          await firstValueFrom(
            this.api.write<CustomerBooking>(this.pendingPath, this.pendingBody, key),
          ),
        );
      } catch (error) {
        if (
          error instanceof ApiFailure &&
          [400, 404, 409].includes(error.status) &&
          error.code !== 'IDEMPOTENCY_CONFLICT'
        )
          this.clearPending();
        throw error;
      }
    });
  }
  async recover() {
    const key = this.pending();
    if (!key) return;
    await this.run(async () => {
      const result = await firstValueFrom(this.api.recover(key));
      if (result.found && result.result) await this.success(result.result);
      else {
        this.canResume.set(true);
        this.message.set(
          'No hay un resultado guardado en esta sesión. Puedes completar de nuevo usando la misma referencia.',
        );
      }
    });
  }
  canRetry() {
    return !!this.pendingPath;
  }
  resume() {
    if (this.canResume()) {
      this.pending.set(null);
      this.canResume.set(false);
    }
  }
  private clearPending() {
    sessionStorage.removeItem('lasheo-public-booking-intent');
    this.pending.set(null);
    this.pendingPath = '';
    this.pendingBody = null;
    this.canResume.set(false);
  }
  private async success(result: CustomerBooking) {
    this.clearPending();
    this.completed.set(result);
    this.changing.set(null);
    this.cancelling.set(null);
    this.invalidateSlots();
    if (result.management_code) this.accessCode.set(result.management_code);
    this.message.set(
      result.estado === 'CANCELADA'
        ? 'Tu solicitud fue cancelada.'
        : result.estado === 'PENDIENTE'
          ? 'Solicitud recibida. Falta la confirmación del salón.'
          : 'Cambio guardado.',
    );
    await this.refreshBookings();
  }
  private async refreshBookings() {
    this.bookings.set((await firstValueFrom(this.api.list())).results);
  }
  async refresh() {
    await this.run(() => this.refreshBookings());
  }
  private async run(action: () => Promise<void>) {
    if (this.busy() || this.pwa.blocked()) return;
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      await action();
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }
  private showError(error: unknown) {
    if (error instanceof ApiFailure) {
      const messages: Record<string, string> = {
        permission_denied:
          'Ingresa el teléfono y la clave de acceso de tu solicitud para continuar.',
        BOOKING_ACCESS_DENIED:
          'No pudimos validar el teléfono y la clave. Revísalos e intenta de nuevo.',
        PUBLIC_BOOKING_DISABLED: 'Las solicitudes online están temporalmente cerradas.',
        PUBLIC_BOOKING_NOT_READY: 'Las reservas online están en preparación. Contacta al salón.',
        BOOKING_CHANGE_DEADLINE: 'Tu reserva ya no admite cambios online. Contacta al salón.',
        IDEMPOTENCY_CONFLICT:
          'Esta referencia ya se utilizó. Consulta su resultado antes de continuar.',
      };
      this.error.set(
        messages[error.code] ?? (Object.values(error.fields).flat().join(' ') || error.message),
      );
    } else
      this.error.set('No pudimos completar la operación. Revisa la conexión y vuelve a intentar.');
  }
  status(value: string) {
    return (
      (
        {
          PENDIENTE: 'Pendiente de confirmación',
          PROGRAMADA: 'Confirmada por el salón',
          CONFIRMADA: 'Confirmada',
          CANCELADA: 'Cancelada',
          RECHAZADA: 'No aceptada',
          COMPLETADA: 'Atendida',
          NO_ASISTIO: 'No asistió',
          EXPIRADA: 'Vencida',
        } as Record<string, string>
      )[value] ?? value
    );
  }
  time(value: string) {
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(value));
  }
}
