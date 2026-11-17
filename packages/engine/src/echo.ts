import type { EngineConfig } from "./config";
import {
  DAILY_METRICS,
  ECHO_TYPES,
  WEEKLY_METRICS,
  type Baseline,
  type DailyHealth,
  type EchoScores,
  type ScoreKey,
} from "./types";
import { clamp, lastDays, mean } from "./util";

export type MetricScores = Partial<Record<ScoreKey, number>>;

const ratioScore = (value: number, base: number, scale: number) => clamp((value / base - 1) / scale, -1, 1);

export function sleepScore(minutes: number, cfg: EngineConfig): number {
  const { idealMin, idealMax, penaltyPerHour } = cfg.score.sleep;
  const off = minutes < idealMin ? idealMin - minutes : minutes > idealMax ? minutes - idealMax : 0;
  return clamp(1 - (off / 60) * penaltyPerHour, -1, 1);
}

export function bedtimeScore(minutes: number, baseline: number, cfg: EngineConfig): number {
  const { fullWithin, worstAt } = cfg.score.bedtime;
  const diff = Math.abs(minutes - baseline);
  if (diff <= fullWithin) return 1;
  return clamp(1 - (2 * (diff - fullWithin)) / (worstAt - fullWithin), -1, 1);
}

export function isActiveDay(d: DailyHealth, cfg: EngineConfig): boolean {
  const { minSteps, minWorkoutMinutes } = cfg.score.activeDays;
  const workout = (d.cardioMinutes ?? 0) + (d.strengthMinutes ?? 0) + (d.highIntensityMinutes ?? 0);
  return d.worn && ((d.steps ?? 0) >= minSteps || workout >= minWorkoutMinutes);
}

/**
 * Score every metric for `today` against the personal baseline, each in [-1, 1].
 * `recent` holds worn, sanitized days before today; sparse workout metrics use a rolling 7-day total
 * so rest days between sessions don't read as "worse than usual".
 */
export function scoreMetrics(
  today: DailyHealth,
  recent: DailyHealth[],
  baseline: Baseline,
  cfg: EngineConfig,
): MetricScores {
  const s = cfg.score;
  const out: MetricScores = {};

  for (const m of DAILY_METRICS) {
    const v = today[m];
    if (typeof v !== "number") continue;
    const base = baseline.daily[m];
    if (m === "restingHr") out[m] = clamp((1 - v / base) / s.restingHrScale, -1, 1);
    else if (m === "deepSleepRatio") out[m] = ratioScore(v, base, s.deepSleepScale);
    else out[m] = ratioScore(v, base, s.ratioScale);
  }

  const week = [...lastDays(recent, today.date, 7).filter((d) => d.date < today.date && d.worn), today];
  for (const m of WEEKLY_METRICS) {
    if (!week.some((d) => typeof d[m] === "number")) continue;
    const perWeek = (week.reduce((a, d) => a + (d[m] ?? 0), 0) / week.length) * 7;
    out[m] = ratioScore(perWeek, baseline.weekly[m], s.ratioScale);
  }

  if (typeof today.sleepMinutes === "number") out.sleep = sleepScore(today.sleepMinutes, cfg);
  if (typeof today.bedtimeMinutes === "number")
    out.bedtime = bedtimeScore(today.bedtimeMinutes, baseline.bedtimeMinutes, cfg);

  const hrvs = lastDays([...recent, today], today.date, s.nightHrvAvgDays)
    .map((d) => d.nightHrvMs)
    .filter((v): v is number => typeof v === "number");
  const hrv = mean(hrvs);
  if (hrv !== undefined && typeof today.nightHrvMs === "number")
    out.nightHrv = ratioScore(hrv, baseline.nightHrvMs, s.nightHrvScale);

  const activeCount = week.filter((d) => isActiveDay(d, cfg)).length;
  out.activeDays = clamp((activeCount - s.activeDays.neutral) / s.activeDays.span, -1, 1);

  return out;
}

/** Weighted echo per type. A type with none of its metrics present today is left out. */
export function echoesFromScores(scores: MetricScores, cfg: EngineConfig): EchoScores {
  const out: EchoScores = {};
  for (const type of ECHO_TYPES) {
    let sum = 0;
    let weight = 0;
    for (const [key, w] of Object.entries(cfg.echoWeights[type]) as [ScoreKey, number][]) {
      const v = scores[key];
      if (v === undefined) continue;
      sum += v * w;
      weight += w;
    }
    if (weight > 0) out[type] = sum / weight;
  }
  return out;
}
