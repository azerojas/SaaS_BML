import { describe, expect, it } from 'vitest';
import { Appointment } from './agenda';
import {
  mergeDayIntervals,
  minutesInDay,
  positionAppointments,
  positionByProfessional,
} from './calendar-layout';
const day = '2026-11-20';
const appointment = (id: number, start: string, end: string) =>
  ({
    id,
    inicio_en: day + 'T' + start + ':00-05:00',
    fin_en: day + 'T' + end + ':00-05:00',
  }) as Appointment;
describe('Posición de citas en calendario horario', () => {
  it('mantiene columnas por especialista tanto en citas simultáneas como separadas', () => {
    const result = positionByProfessional(
      [
        { ...appointment(1, '10:00', '11:00'), profesional_id: 10 },
        { ...appointment(2, '10:00', '11:00'), profesional_id: 20 },
        { ...appointment(3, '14:00', '15:00'), profesional_id: 20 },
      ],
      day,
      [10, 20, 30],
    );
    expect(result.map(({ appointment: row, lane, lanes }) => [row.id, lane, lanes])).toEqual([
      [1, 0, 3],
      [2, 1, 3],
      [3, 1, 3],
    ]);
    const filtered = positionByProfessional(
      [{ ...appointment(2, '10:00', '11:00'), profesional_id: 20 }],
      day,
      [20],
    );
    expect(filtered.map(({ lane, lanes }) => [lane, lanes])).toEqual([[0, 1]]);
  });
  it('separa posibles cruces heredados dentro de una especialista sin invadir otra columna', () => {
    const result = positionByProfessional(
      [
        { ...appointment(1, '10:00', '11:00'), profesional_id: 10 },
        { ...appointment(2, '10:30', '11:30'), profesional_id: 10 },
        { ...appointment(3, '10:00', '11:00'), profesional_id: 20 },
      ],
      day,
      [10, 20],
    );
    expect(result.map(({ lane, lanes }) => [lane, lanes])).toEqual([
      [0, 4],
      [1, 4],
      [1, 2],
    ]);
  });
  it('añade disponibilidad sin perder franjas y une solapamientos y límites contiguos', () => {
    const original = [
      { inicio: '09:00', fin: '12:00' },
      { inicio: '14:00', fin: '17:00' },
    ];
    expect(mergeDayIntervals([...original, { inicio: '17:00', fin: '18:00' }])).toEqual([
      { inicio: '09:00', fin: '12:00' },
      { inicio: '14:00', fin: '18:00' },
    ]);
    expect(mergeDayIntervals([...original, { inicio: '11:00', fin: '15:00' }])).toEqual([
      { inicio: '09:00', fin: '17:00' },
    ]);
    expect(original).toEqual([
      { inicio: '09:00', fin: '12:00' },
      { inicio: '14:00', fin: '17:00' },
    ]);
  });
  it('comparte columnas en cruces transitivos y recupera ancho completo al terminar', () => {
    const result = positionAppointments(
      [
        appointment(1, '09:00', '10:00'),
        appointment(2, '09:30', '10:30'),
        appointment(3, '10:00', '11:00'),
        appointment(4, '11:00', '12:00'),
      ],
      day,
    );
    expect(result.map(({ lane, lanes }) => [lane, lanes])).toEqual([
      [0, 2],
      [1, 2],
      [0, 2],
      [0, 1],
    ]);
  });
  it('recorta eventos que cruzan medianoche usando Lima, independiente del navegador', () => {
    expect(minutesInDay('2026-11-20T14:30:00Z', day)).toBe(570);
    const [event] = positionAppointments(
      [
        {
          id: 1,
          inicio_en: '2026-11-19T23:30:00-05:00',
          fin_en: '2026-11-20T00:30:00-05:00',
        } as Appointment,
      ],
      day,
    );
    expect([event.start, event.end]).toEqual([0, 30]);
    expect(
      positionAppointments(
        [
          {
            id: 2,
            inicio_en: '2026-11-19T23:00:00-05:00',
            fin_en: '2026-11-20T00:00:00-05:00',
          } as Appointment,
        ],
        day,
      ),
    ).toEqual([]);
  });
});
