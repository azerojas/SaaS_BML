import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { SlotPicker } from './slot-picker';
import { AgendaApi } from '../infrastructure/agenda-api';
import { Availability } from '../domain/agenda';
import { SessionStore } from '../../../core/auth/application/session-store';
describe('Selector de disponibilidad: respuestas obsoletas', () => {
  it('no consulta profesionales ni disponibilidad para roles bloqueados por privacidad', async () => {
    const all = vi.fn(),
      availability = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: SessionStore, useValue: { hasPermission: () => false } },
        { provide: AgendaApi, useValue: { all, availability } },
      ],
    });
    const fixture = TestBed.createComponent(SlotPicker);
    fixture.componentRef.setInput('services', [2]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.form.patchValue({ professional: '7', date: '2026-12-01' });
    fixture.componentInstance.search();
    expect(all).not.toHaveBeenCalled();
    expect(availability).not.toHaveBeenCalled();
    expect(fixture.componentInstance.professionals.error()).toContain('permiso');
    fixture.destroy();
  });
  it('cambiar fecha invalida selección y cancela respuesta anterior', async () => {
    const response = new Subject<Availability>();
    const availability = vi.fn(() => response);
    TestBed.configureTestingModule({
      providers: [
        { provide: SessionStore, useValue: { hasPermission: () => true } },
        {
          provide: AgendaApi,
          useValue: {
            all: () => of([{ id: 7, nombres: 'Equipo', apellidos: 'Prueba', servicios: [2] }]),
            get: () => of({ servicios: [2] }),
            availability,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(SlotPicker);
    fixture.componentRef.setInput('services', [2]);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.form.patchValue({ professional: '7', date: '2026-12-01' });
    component.search();
    expect(availability).toHaveBeenCalledWith('2026-12-01', 7, [2], undefined);
    component.form.controls.date.setValue('2026-12-02');
    response.next({ slots: [{ inicio_en: '2026-12-01T09:00:00-05:00' }] } as Availability);
    expect(component.availability.data()).toBeNull();
    expect(component.selected).toBe('');
    expect(component.availability.loading()).toBe(false);
    fixture.destroy();
  });
});
