import type { EngineConfig } from "./config";
import { isActiveDay } from "./echo";
import { ECHO_TYPES, type DailyHealth, type EchoType } from "./types";
import { mean, median } from "./util";

export type Affinity = Record<EchoType, number>;

const ratio = (v: number | undefined, ref: number) => Math.min(1, (v ?? 0) / ref);

/**
 * How much a lifestyle each type represents over a window, in [0, 1], measured against absolute health
 * guidelines rather than the personal baseline. A runner who has run 3×/week for years should count as a
 * runner, even though they are not improving on themselves. Used for evolution branches and wild encounters.
 */
export function lifestyleAffinity(days: DailyHealth[], cfg: EngineConfig): Affinity {
  const worn = days.filter((d) => d.worn);
  const out = Object.fromEntries(ECHO_TYPES.map((t) => [t, 0])) as Affinity;
  if (worn.length === 0) return out;

  const a = cfg.affinity;
  const avg = (k: keyof DailyHealth) =>
    mean(worn.map((d) => d[k]).filter((v): v is number => typeof v === "number"));
  const perWeek = (k: keyof DailyHealth) =>
    (worn.reduce((s, d) => s + ((d[k] as number | undefined) ?? 0), 0) / worn.length) * 7;

  const beds = worn.map((d) => d.bedtimeMinutes).filter((v): v is number => typeof v === "number");
  const bedMedian = median(beds);
  const regular =
    bedMedian === undefined ? 0 : beds.filter((b) => Math.abs(b - bedMedian) <= a.bedtimeRegularWithin).length / beds.length;
  const activePerWeek = (worn.filter((d) => isActiveDay(d, cfg)).length / worn.length) * 7;

  out.grass = 0.7 * ratio(avg("steps"), a.stepsPerDay) + 0.3 * ratio(avg("standHours"), a.standHoursPerDay);
  const sleep = avg("sleepMinutes");
  const sleepPart =
    sleep === undefined ? 0 : Math.max(0, Math.min(1, (sleep - a.sleepFloorMinutes) / (a.sleepMinutesPerNight - a.sleepFloorMinutes)));
  out.water = 0.6 * sleepPart + 0.4 * regular;
  out.shadow = ratio(avg("deepSleepRatio"), a.deepSleepRatio);
  out.fire = 0.6 * ratio(avg("activeEnergyKcal"), a.activeEnergyPerDay) + 0.4 * ratio(perWeek("highIntensityMinutes"), a.vigorousMinutesPerWeek);
  out.fighting = ratio(perWeek("strengthMinutes"), a.strengthMinutesPerWeek);
  out.flying = 0.7 * ratio(perWeek("cardioMinutes"), a.cardioMinutesPerWeek) + 0.3 * ratio(perWeek("distanceKm"), a.distanceKmPerWeek);
  out.electric = ratio(perWeek("highHrZoneMinutes"), a.highHrMinutesPerWeek);
  out.ground = 0.6 * ratio(activePerWeek, a.activeDaysPerWeek) + 0.4 * ratio(avg("flightsClimbed"), a.flightsPerDay);
  return out;
}

export function topAffinity(aff: Affinity, min = 0): EchoType | null {
  let best: EchoType | null = null;
  for (const t of ECHO_TYPES) if (aff[t] >= min && (best === null || aff[t] > aff[best])) best = t;
  return best;
}
