import type { DailyHealth } from "@pulseling/engine";

/**
 * Day/night cycle. Tamagotchi ties bedtime to the clock set at hatch; we tie it to *your* usual bedtime and wake
 * time from Health data, so the pet sleeps when you do. Lights go off by themselves (no care chore), and staying
 * up late costs nothing: the pet is just asleep and whispers a nudge if you tap it.
 */
export type DayPhase = "morning" | "day" | "winddown" | "sleep";

const median = (xs: number[]) => {
  if (!xs.length) return undefined;
  const v = [...xs].sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)]!;
};

/** Usual bedtime (minutes from midnight, may be negative = before midnight) and wake time, from the last 14 worn nights. */
export function sleepWindow(history: DailyHealth[]): { bed: number; wake: number } {
  const nights = history.slice(-14).filter((d): d is DailyHealth & { worn: true } => d.worn);
  const bed = median(nights.map((d) => d.bedtimeMinutes).filter((x): x is number => x !== undefined)) ?? -30;
  const sleep = median(nights.map((d) => d.sleepMinutes).filter((x): x is number => x !== undefined)) ?? 450;
  return { bed, wake: bed + sleep };
}

/** `now` is minutes since midnight (0–1439). */
export function dayPhase(now: number, w: { bed: number; wake: number }): DayPhase {
  // shift so bedtime-ish values compare correctly across midnight
  const rel = (m: number) => ((m - w.bed + 1440 * 2) % 1440);
  const t = rel(now);
  const sleepLen = w.wake - w.bed;
  if (t < sleepLen) return "sleep";
  if (t < sleepLen + 90) return "morning";
  if (t >= 1440 - 60) return "winddown";
  return "day";
}

export const fmtClock = (m: number) => {
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};
