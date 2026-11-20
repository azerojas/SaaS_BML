import { addDays } from '../../dashboard/domain/periods';
import { Appointment, DayInterval } from './agenda';

/** Add a selected window without removing or overlapping existing availability. */
export function mergeDayIntervals(rows: DayInterval[]): DayInterval[] {
  const merged: DayInterval[] = [];
  for (const row of [...rows].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
    const last = merged.at(-1);
    if (last && row.inicio <= last.fin) last.fin = row.fin > last.fin ? row.fin : last.fin;
    else merged.push({ ...row });
  }
  return merged;
}

export function minutesInDay(instant: string, day: string): number {
  return Math.max(
    0,
    Math.min(1440, (Date.parse(instant) - Date.parse(day + 'T00:00:00-05:00')) / 60000),
  );
}
export function timeMinutes(value: string): number {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}
export interface PositionedAppointment {
  appointment: Appointment;
  start: number;
  end: number;
  lane: number;
  lanes: number;
}
/** Connected overlap clusters share width; adjacent appointments use the full column again. */
export function positionAppointments(rows: Appointment[], day: string): PositionedAppointment[] {
  const lower = Date.parse(day + 'T00:00:00-05:00');
  const upper = Date.parse(addDays(day, 1) + 'T00:00:00-05:00');
  const intervals = rows
    .filter((row) => Date.parse(row.inicio_en) < upper && Date.parse(row.fin_en) > lower)
    .map((appointment) => ({
      appointment,
      start: minutesInDay(appointment.inicio_en, day),
      end: minutesInDay(appointment.fin_en, day),
      lane: 0,
      lanes: 1,
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end || a.appointment.id - b.appointment.id);
  let cluster: PositionedAppointment[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];
  const finish = () => cluster.forEach((item) => (item.lanes = laneEnds.length));
  for (const item of intervals) {
    if (item.start >= clusterEnd) {
      finish();
      cluster = [];
      laneEnds = [];
      clusterEnd = -1;
    }
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = item.end;
    item.lane = lane;
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  finish();
  return intervals;
}

/** Keep each specialist in a stable column even when appointments do not overlap. */
export function positionByProfessional(
  rows: Appointment[],
  day: string,
  professionals: number[],
): PositionedAppointment[] {
  return professionals.flatMap((id, index) =>
    positionAppointments(
      rows.filter((row) => row.profesional_id === id),
      day,
    ).map((event) => ({
      ...event,
      lane: index * event.lanes + event.lane,
      lanes: professionals.length * event.lanes,
    })),
  );
}
