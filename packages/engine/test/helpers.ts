import { addDays, type DailyHealth } from "../src";

export const START = "2026-01-01";

export const typicalDay: Omit<DailyHealth, "date"> = {
  worn: true,
  steps: 6000,
  standHours: 9,
  activeEnergyKcal: 400,
  flightsClimbed: 5,
  sleepMinutes: 420,
  bedtimeMinutes: -30,
  deepSleepRatio: 0.15,
  nightHrvMs: 40,
  restingHr: 65,
};

export function series(
  days: number,
  make: (i: number) => Partial<DailyHealth> = () => ({}),
  base: Omit<DailyHealth, "date"> = typicalDay,
  start = START,
): DailyHealth[] {
  return Array.from({ length: days }, (_, i) => ({ ...base, ...make(i), date: addDays(start, i) }));
}

/** Cardio three times a week (Mon/Wed/Fri pattern). */
export const runner = (i: number): Partial<DailyHealth> =>
  i % 7 === 0 || i % 7 === 2 || i % 7 === 4 ? { cardioMinutes: 45, distanceKm: 6 } : {};

/** Strength twice a week. */
export const lifter = (i: number): Partial<DailyHealth> =>
  i % 7 === 1 || i % 7 === 4 ? { strengthMinutes: 45 } : {};
