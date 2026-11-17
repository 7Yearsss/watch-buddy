import { lifestyleAffinity, type Affinity } from "./affinity";
import type { EngineConfig } from "./config";
import { upgradeRarity } from "./rarity";
import type { AdultVariant, DailyHealth, EchoType, PetState, Stage } from "./types";
import { daysBetween, lastDays } from "./util";

export type EvolutionGap =
  | { kind: "below"; type: EchoType; current: number; required: number }
  | { kind: "notHighest"; type: EchoType; leader: EchoType }
  | { kind: "dragon"; strongTypes: EchoType[]; requiredTypes: number; strongExercise: number; requiredExercise: number };

export interface EvolutionOption {
  variant: AdultVariant;
  met: boolean;
  gaps: EvolutionGap[];
  /** Evolving into this form raises rarity one tier. Pure is the free fallback, so it doesn't. */
  earnsRarityUpgrade: boolean;
}

export interface EvolutionStatus {
  stage: Stage;
  nextStage: Exclude<Stage, "baby"> | null;
  progress: number;
  threshold: number;
  daysInStage: number;
  minDays: number;
  barFull: boolean;
  /** Bar full and minimum days reached. */
  ready: boolean;
  /** Adult branches with their conditions; empty before the juvenile stage. */
  options: EvolutionOption[];
  /** What happens automatically today, if anything. Without a met target the pet stays "charging" until the player picks. */
  auto: "juvenile" | AdultVariant | null;
  /** For the first evolution: whether a real habit was kept, which raises rarity one tier. */
  earnsRarityUpgrade: boolean;
}

export function stageThreshold(stage: Stage, cfg: EngineConfig): { threshold: number; minDays: number } | null {
  if (stage === "baby") return cfg.evolution.juvenile;
  if (stage === "juvenile") return cfg.evolution.adult;
  return null;
}

export function adultOptions(affinity: Affinity, dragonAffinity: Affinity, cfg: EngineConfig): EvolutionOption[] {
  const e = cfg.evolution;
  const options: EvolutionOption[] = [{ variant: "pure", met: true, gaps: [], earnsRarityUpgrade: false }];

  for (const type of e.secondTypes) {
    const gaps: EvolutionGap[] = [];
    if (affinity[type] < e.minAffinity) gaps.push({ kind: "below", type, current: affinity[type], required: e.minAffinity });
    const leader = e.secondTypes.reduce((best, t) => (affinity[t] > affinity[best] ? t : best), type);
    if (leader !== type && affinity[leader] > affinity[type]) gaps.push({ kind: "notHighest", type, leader });
    options.push({ variant: type, met: gaps.length === 0, gaps, earnsRarityUpgrade: gaps.length === 0 });
  }

  const d = e.dragon;
  const strongTypes = (Object.keys(dragonAffinity) as EchoType[]).filter((t) => dragonAffinity[t] >= d.minAffinity);
  const strongExercise = strongTypes.filter((t) => d.exerciseTypes.includes(t)).length;
  const dragonMet = strongTypes.length >= d.minTypes && strongExercise >= d.minExerciseTypes;
  options.push({
    variant: "dragon",
    met: dragonMet,
    earnsRarityUpgrade: dragonMet,
    gaps: dragonMet
      ? []
      : [{ kind: "dragon", strongTypes, requiredTypes: d.minTypes, strongExercise, requiredExercise: d.minExerciseTypes }],
  });
  return options;
}

/** `history` should include `today`. */
export function evolutionStatus(pet: PetState, history: DailyHealth[], today: string, cfg: EngineConfig): EvolutionStatus {
  const t = stageThreshold(pet.stage, cfg);
  const daysInStage = daysBetween(pet.stageStartedOn, today);
  if (!t) {
    return { stage: pet.stage, nextStage: null, progress: 0, threshold: 0, daysInStage, minDays: 0, barFull: false, ready: false, options: [], auto: null, earnsRarityUpgrade: false };
  }

  const barFull = pet.progress >= t.threshold;
  const ready = barFull && daysInStage >= t.minDays;

  if (pet.stage === "baby") {
    const recent = lifestyleAffinity(lastDays(history, today, cfg.evolution.juvenileUpgrade.windowDays), cfg);
    const earnsRarityUpgrade = cfg.evolution.juvenileUpgrade.types.some((t) => recent[t] >= cfg.evolution.minAffinity);
    return { stage: "baby", nextStage: "juvenile", progress: pet.progress, threshold: t.threshold, daysInStage, minDays: t.minDays, barFull, ready, options: [], auto: ready ? "juvenile" : null, earnsRarityUpgrade };
  }

  const affinity = lifestyleAffinity(lastDays(history, today, cfg.evolution.windowDays), cfg);
  const dragonAffinity = lifestyleAffinity(lastDays(history, today, cfg.evolution.dragon.windowDays), cfg);
  const options = adultOptions(affinity, dragonAffinity, cfg);
  const target = pet.target ? options.find((o) => o.variant === pet.target) : undefined;

  return {
    stage: "juvenile",
    nextStage: "adult",
    progress: pet.progress,
    threshold: t.threshold,
    daysInStage,
    minDays: t.minDays,
    barFull,
    ready,
    options,
    auto: ready && target?.met ? target.variant : null,
    earnsRarityUpgrade: false,
  };
}

/** Apply an evolution the status allows. Pure is always allowed as the fallback once the bar is ready. Keeping a real habit raises rarity one tier. */
export function evolve(pet: PetState, status: EvolutionStatus, choice: "juvenile" | AdultVariant, today: string): PetState {
  if (!status.ready) throw new Error("Evolution is not ready yet");
  if (status.nextStage === "juvenile") {
    if (choice !== "juvenile") throw new Error("A baby can only become a juvenile");
    const evolved: PetState = { ...pet, stage: "juvenile", stageStartedOn: today, progress: 0 };
    return status.earnsRarityUpgrade ? upgradeRarity(evolved, "juvenile") : evolved;
  }
  if (status.nextStage === "adult") {
    const option = status.options.find((o) => o.variant === choice);
    if (!option?.met) throw new Error(`Conditions for ${choice} are not met`);
    const evolved: PetState = { ...pet, stage: "adult", adultVariant: option.variant, stageStartedOn: today, progress: 0, target: undefined };
    return option.earnsRarityUpgrade ? upgradeRarity(evolved, "adult") : evolved;
  }
  throw new Error("This pet cannot evolve further");
}
