import type { EngineConfig } from "./config";
import { DAILY_METRICS, WEEKLY_METRICS, type Baseline, type DailyHealth } from "./types";
import { addDays, median } from "./util";

/** Clamp each field to its anti-cheat cap. Manual entries are filtered out on the phone before this point. */
export function sanitize(day: DailyHealth, cfg: EngineConfig): DailyHealth {
  const out: DailyHealth = { ...day };
  for (const [key, cap] of Object.entries(cfg.caps) as [keyof DailyHealth, number][]) {
    const v = out[key];
    if (typeof v === "number") (out as unknown as Record<string, number>)[key] = Math.max(0, Math.min(v, cap));
  }
  return out;
}

function blend(own: number | undefined, n: number, fallback: number, blendDays: number): number {
  if (own === undefined || n === 0) return fallback;
  if (n >= blendDays) return own;
  return (n * own + (blendDays - n) * fallback) / blendDays;
}

/** Personal baseline from the `windowDays` days before `asOf` (exclusive). Unworn days are ignored. */
export function computeBaseline(history: DailyHealth[], asOf: string, cfg: EngineConfig): Baseline {
  const { baseline: b } = cfg;
  const start = addDays(asOf, -b.windowDays);
  const days = history.filter((d) => d.worn && d.date >= start && d.date < asOf);
  const n = days.length;

  const daily = {} as Baseline["daily"];
  for (const m of DAILY_METRICS) {
    const vals = days.map((d) => d[m]).filter((v): v is number => typeof v === "number");
    const v = blend(median(vals), vals.length, b.dailyDefaults[m], b.blendDays);
    const floor = b.dailyFloors[m];
    daily[m] = floor === undefined ? v : Math.max(floor, v);
  }

  const weekly = {} as Baseline["weekly"];
  for (const m of WEEKLY_METRICS) {
    const sum = days.reduce((acc, d) => acc + (d[m] ?? 0), 0);
    const perWeek = n > 0 ? (sum / n) * 7 : undefined;
    weekly[m] = Math.max(b.weeklyFloors[m], blend(perWeek, n, b.weeklyDefaults[m], b.blendDays));
  }

  const beds = days.map((d) => d.bedtimeMinutes).filter((v): v is number => typeof v === "number");
  const hrvs = days.map((d) => d.nightHrvMs).filter((v): v is number => typeof v === "number");

  return {
    daily,
    weekly,
    bedtimeMinutes: blend(median(beds), beds.length, b.bedtimeDefault, b.blendDays),
    nightHrvMs: Math.max(b.nightHrvFloor, blend(median(hrvs), hrvs.length, b.nightHrvDefault, b.blendDays)),
    sampleDays: n,
  };
}
