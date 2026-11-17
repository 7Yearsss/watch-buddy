import { simulateBattle, type BattleResult } from "./battle";
import type { EngineConfig } from "./config";
import type { WildSpecies } from "./encounter";
import { getSkill, TYPE_SKILL, ULTIMATE, type SkillId } from "./skills";
import { petCombatant, petStats, petTypes, type Combatant, type StatBlock, type Tactic } from "./species";
import { effectiveness } from "./typechart";
import { STATS, type EchoType, type ElementType, type PetState } from "./types";

const meanStat = (s: StatBlock) => STATS.reduce((a, k) => a + s[k], 0) / STATS.length;

/** Scale a 250-point stat shape so its average matches `reference × strength`. */
function scaled(shape: StatBlock, reference: StatBlock, strength: number): StatBlock {
  const target = meanStat(reference) * strength;
  const out = {} as StatBlock;
  for (const s of STATS) out[s] = (shape[s] / 50) * target;
  return out;
}

export function averageStats(blocks: StatBlock[]): StatBlock {
  const out = {} as StatBlock;
  for (const s of STATS) out[s] = blocks.reduce((a, b) => a + b[s], 0) / Math.max(1, blocks.length);
  return out;
}

/** Wild opponents scale with your own pet so the daily trial stays winnable but not free. */
export function wildCombatant(species: WildSpecies, reference: StatBlock, cfg: EngineConfig): Combatant {
  return {
    name: species.id,
    types: [species.type],
    stats: scaled(species.base, reference, cfg.opponents.wildStrength[species.rarity]),
    skills: (["tackle", species.teaches, "guard", "rest"] as SkillId[]).map(getSkill),
    tactic: "balanced",
  };
}

export function trainingCombatant(reference: StatBlock, cfg: EngineConfig): Combatant {
  const flat = { hp: 50, recovery: 50, attack: 50, speed: 50, defense: 50 };
  return {
    name: "training-dummy",
    types: [],
    stats: scaled(flat, reference, cfg.opponents.trainingStrength),
    skills: (["tackle", "guard"] as SkillId[]).map(getSkill),
    tactic: "balanced",
  };
}

export type Matchup = keyof EngineConfig["opponents"]["bossStrength"];

export function bossMatchup(bossType: EchoType, petTypes: ElementType[]): Matchup {
  if (effectiveness(bossType, petTypes) > 1) return "bossAdvantage";
  if (petTypes.some((t) => effectiveness(t, [bossType]) > 1)) return "petAdvantage";
  return "neutral";
}

/**
 * Weekly boss, scaled from your pet's current stats (before the condition bonus) and softened or hardened by
 * the type matchup. Beat it by having a better week than usual and bringing a skill that counters its type.
 * (Scaling from a 4-week average made it far too easy: pets grow, and evolving jumps their stats.)
 */
export function bossCombatant(type: EchoType, reference: StatBlock, petTypes: ElementType[], cfg: EngineConfig): Combatant {
  const flat = { hp: 50, recovery: 50, attack: 50, speed: 50, defense: 50 };
  return {
    name: `boss-${type}`,
    types: [type],
    stats: scaled(flat, reference, cfg.opponents.bossStrength[bossMatchup(type, petTypes)]),
    skills: (["tackle", TYPE_SKILL[type], "guard", ULTIMATE[type]] as SkillId[]).map(getSkill),
    tactic: "balanced",
  };
}

export interface PetBattleOptions {
  loadout?: SkillId[];
  tactic?: Tactic;
  recentQualities?: number[];
}

/** Daily trial against today's wild monster (or a training dummy). Winning a wild one captures it. */
export function runDailyTrial(
  pet: PetState,
  input: { userId: string; date: string; wild: WildSpecies | null } & PetBattleOptions,
  cfg: EngineConfig,
): { opponent: Combatant; result: BattleResult; captured: boolean } {
  const me = petCombatant(pet, input, cfg);
  const reference = petStats(pet);
  const opponent = input.wild ? wildCombatant(input.wild, reference, cfg) : trainingCombatant(reference, cfg);
  const result = simulateBattle(me, opponent, `${input.userId}:${input.date}:trial`);
  return { opponent, result, captured: input.wild !== null && result.winner === "a" };
}

export function runWeeklyBoss(
  pet: PetState,
  input: { userId: string; date: string; type: EchoType } & PetBattleOptions,
  cfg: EngineConfig,
): { opponent: Combatant; result: BattleResult } {
  const opponent = bossCombatant(input.type, petStats(pet), petTypes(pet), cfg);
  const result = simulateBattle(petCombatant(pet, input, cfg), opponent, `${input.userId}:${input.date}:boss`);
  return { opponent, result };
}
