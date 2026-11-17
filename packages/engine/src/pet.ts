import { lifestyleAffinity, topAffinity } from "./affinity";
import { computeBaseline, sanitize } from "./baseline";
import type { EngineConfig } from "./config";
import { echoesFromScores, isActiveDay, scoreMetrics } from "./echo";
import { dayGrowth, noGrowth, type DayGrowth } from "./growth";
import { stageThreshold } from "./evolution";
import { ACTIVE_DAYS_FOR_UPGRADE, rollCosmetics, rollRarity, upgradeRarity } from "./rarity";
import { createRng, pick } from "./rng";
import { PERSONALITIES, STATS, type DailyHealth, type EchoScores, type EchoType, type PetState, type Starter } from "./types";
import { addDays, mean } from "./util";

export const SHINY_ODDS = 64;

export interface HatchFacts {
  historyDays: number;
  avgSteps?: number;
  avgSleepMinutes?: number;
  weeklyCardioMinutes?: number;
  weeklyStrengthMinutes?: number;
  /** Strongest lifestyle in the history, used for the egg-shell pattern and the first line. */
  topLifestyle: EchoType | null;
}

export interface HatchResult {
  pet: PetState;
  facts: HatchFacts;
}

/** Hatch on first launch using the past 28 days of HealthKit history. Personality and shininess come from the seed. */
export function hatch(
  input: { id: string; starter: Starter; date: string; history: DailyHealth[]; seed?: string },
  cfg: EngineConfig,
): HatchResult {
  const rng = createRng(input.seed ?? input.id);
  const start = addDays(input.date, -cfg.baseline.windowDays);
  const window = input.history.filter((d) => d.worn && d.date >= start && d.date < input.date).map((d) => sanitize(d, cfg));
  const avg = (k: keyof DailyHealth) => mean(window.map((d) => d[k]).filter((v): v is number => typeof v === "number"));
  const perWeek = (k: keyof DailyHealth) =>
    window.length ? (window.reduce((s, d) => s + ((d[k] as number | undefined) ?? 0), 0) / window.length) * 7 : undefined;

  const personality = pick(rng, PERSONALITIES);
  const rarity = rollRarity(rng);
  const pet: PetState = {
    id: input.id,
    starter: input.starter,
    personality,
    hatchRarity: rarity,
    rarity,
    rarityUpgrades: [],
    cosmetics: rollCosmetics(rng, rarity),
    activeDays: 0,
    shiny: rng() < 1 / SHINY_ODDS,
    stage: "baby",
    hatchedOn: input.date,
    stageStartedOn: input.date,
    progress: 0,
    totalGrowth: 0,
    statGrowth: Object.fromEntries(STATS.map((s) => [s, 0])) as PetState["statGrowth"],
  };

  return {
    pet,
    facts: {
      historyDays: window.length,
      avgSteps: avg("steps"),
      avgSleepMinutes: avg("sleepMinutes"),
      weeklyCardioMinutes: perWeek("cardioMinutes"),
      weeklyStrengthMinutes: perWeek("strengthMinutes"),
      topLifestyle: window.length ? topAffinity(lifestyleAffinity(window, cfg), 0.3) : null,
    },
  };
}

export interface DayResult extends DayGrowth {
  date: string;
  worn: boolean;
  echoes: EchoScores;
}

/**
 * Settle one day: score it against the personal baseline and add growth.
 * `history` holds the days before `today`. A hibernating pet (`active: false`) or an unworn day earns nothing.
 */
export function processDay(
  pet: PetState,
  today: DailyHealth,
  history: DailyHealth[],
  opts: { active: boolean },
  cfg: EngineConfig,
): { pet: PetState; result: DayResult } {
  const day = sanitize(today, cfg);
  if (!day.worn || !opts.active) {
    return { pet, result: { date: day.date, worn: day.worn, echoes: {}, ...noGrowth() } };
  }

  const prior = history.filter((d) => d.date < day.date).map((d) => sanitize(d, cfg));
  const baseline = computeBaseline(prior, day.date, cfg);
  const echoes = echoesFromScores(scoreMetrics(day, prior.filter((d) => d.worn), baseline, cfg), cfg);
  const growth = dayGrowth(echoes, cfg);

  const t = stageThreshold(pet.stage, cfg);
  const statGrowth = { ...pet.statGrowth };
  for (const s of STATS) statGrowth[s] += growth.statGains[s];

  const activeDays = pet.activeDays + (isActiveDay(day, cfg) ? 1 : 0);
  let next: PetState = {
    ...pet,
    progress: t ? Math.min(t.threshold, pet.progress + growth.gain) : pet.progress,
    totalGrowth: pet.totalGrowth + growth.gain,
    statGrowth,
    activeDays,
  };
  if (activeDays >= ACTIVE_DAYS_FOR_UPGRADE) next = upgradeRarity(next, "activeDays");

  return { pet: next, result: { date: day.date, worn: true, echoes, ...growth } };
}
