import type { EngineConfig } from "./config";
import { createRng, pick } from "./rng";
import { ECHO_TYPES, type EchoType } from "./types";
import { addDays, daysBetween } from "./util";

/** Monday of the week containing `date` (weeks reset on Monday). */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

export const isSunday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() === 0;

/** Growth earned since this week's Monday, up to and including `date`. */
export function weeklyEnergy(results: { date: string; gain: number }[], date: string): number {
  const start = weekStart(date);
  return results.filter((r) => r.date >= start && r.date <= date).reduce((s, r) => s + r.gain, 0);
}

/** 0–1 share of the most a week can hold. */
export function weeklyEnergyFraction(energy: number, cfg: EngineConfig): number {
  return Math.min(1, energy / (7 * (cfg.growth.base + cfg.growth.bonus)));
}

/** The first boss comes on day 6 after hatching so trial users see one; after that, every Sunday at least 4 days later. */
export function isBossDay(date: string, hatchedOn: string): boolean {
  const first = addDays(hatchedOn, 6);
  if (date === first) return true;
  return date > first && isSunday(date) && daysBetween(first, date) >= 4;
}

/** Boss type is announced on Monday and fixed for the week. Dragon bosses are saved for events. */
export function bossTypeForWeek(userId: string, date: string): EchoType {
  return pick(createRng(`${userId}:${weekStart(date)}:boss`), ECHO_TYPES);
}

export type { EchoType };
