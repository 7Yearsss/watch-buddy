import type { EngineConfig } from "./config";
import { STATS, type EchoScores, type EchoType, type Stat } from "./types";
import { clamp, mean } from "./util";

const ACTIVITY_TYPES: EchoType[] = ["grass", "fire", "fighting", "flying", "electric"];

export interface DayGrowth {
  gain: number;
  statGains: Record<Stat, number>;
  /** 0–1: how good the day was (sleep + activity), drives the condition bonus. */
  quality: number;
}

const zeroStats = (): Record<Stat, number> => Object.fromEntries(STATS.map((s) => [s, 0])) as Record<Stat, number>;

const bestOf = (echoes: EchoScores, types: EchoType[]) =>
  Math.max(0, ...types.map((t) => echoes[t] ?? 0));

/**
 * Most people charge the watch overnight, so a missing night must not cost growth. For growth, stats and condition the
 * water (rest) echo counts as at least "an ordinary night": no sleep data scores as ordinary, and a poor night recorded
 * by the watch never scores below it, so wearing the watch to bed can only help. Encounters still see the raw echoes.
 */
export function restFloored(echoes: EchoScores, cfg: EngineConfig): EchoScores {
  const n = cfg.growth.ordinaryNightEcho;
  return { ...echoes, water: Math.max(echoes.water ?? n, n) };
}

/** Growth earned on one day with data. Having data alone earns the base amount; doing better than usual in several areas up to doubles it. */
export function dayGrowth(raw: EchoScores, cfg: EngineConfig): DayGrowth {
  const g = cfg.growth;
  const echoes = restFloored(raw, cfg);
  const top = Object.values(echoes)
    .map((v) => Math.max(0, v))
    .sort((a, b) => b - a)
    .slice(0, g.topEchoes);
  const best = top.length ? top.reduce((s, v) => s + v, 0) / g.topEchoes : 0;

  const statGains = zeroStats();
  for (const stat of STATS) statGains[stat] = g.statBase + g.statBonus * bestOf(echoes, cfg.statSources[stat]);

  const quality = clamp(0.5 * Math.max(0, echoes.water ?? 0) + 0.5 * bestOf(echoes, ACTIVITY_TYPES), 0, 1);
  return { gain: g.base + g.bonus * best, statGains, quality };
}

export const noGrowth = (): DayGrowth => ({ gain: 0, statGains: zeroStats(), quality: 0 });

/** Condition multiplier in [1, 1 + max] from the last few worn days. Never below 1: slacking off only means no bonus. */
export function conditionMultiplier(recentQualities: number[], cfg: EngineConfig): number {
  const q = mean(recentQualities.slice(-cfg.condition.days)) ?? 0;
  return 1 + cfg.condition.max * clamp(q, 0, 1);
}

/** Base stat with diminishing returns, so a 3-month pet is stronger than a 1-month pet but not 10× stronger. */
export function statValue(speciesBase: number, growth: number): number {
  return speciesBase * (1 + 0.5 * Math.log2(1 + growth / 300));
}
