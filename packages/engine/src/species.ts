import { conditionMultiplier, statValue } from "./growth";
import type { EngineConfig } from "./config";
import { getSkill, TYPE_SKILL, ULTIMATE, type Skill, type SkillId } from "./skills";
import { STATS, type AdultVariant, type ElementType, type PetState, type Stat, type Starter } from "./types";

export type StatBlock = Record<Stat, number>;

/** Every species totals 250 base points, so no starter or rarity is simply stronger. */
export const STARTER_BASE: Record<Starter, StatBlock> = {
  grass: { hp: 58, recovery: 50, attack: 48, speed: 46, defense: 48 },
  water: { hp: 56, recovery: 54, attack: 48, speed: 46, defense: 46 },
  fire: { hp: 52, recovery: 48, attack: 54, speed: 49, defense: 47 },
};

const VARIANT_SHIFT: Partial<Record<AdultVariant, Partial<StatBlock>>> = {
  flying: { speed: 10, defense: -10 },
  fighting: { attack: 10, recovery: -10 },
  ground: { defense: 10, speed: -10 },
};

export const STAGE_MULTIPLIER = { baby: 1, juvenile: 1.15, adult: 1.3 } as const;

export function petTypes(pet: PetState): ElementType[] {
  if (pet.stage !== "adult" || !pet.adultVariant || pet.adultVariant === "pure") return [pet.starter];
  return [pet.starter, pet.adultVariant];
}

export function petBaseStats(pet: PetState): StatBlock {
  const base = { ...STARTER_BASE[pet.starter] };
  if (pet.stage === "adult" && pet.adultVariant === "dragon") {
    for (const s of STATS) base[s] = 50;
  } else if (pet.stage === "adult" && pet.adultVariant) {
    for (const [s, d] of Object.entries(VARIANT_SHIFT[pet.adultVariant] ?? {}) as [Stat, number][]) base[s] += d;
  }
  const m = STAGE_MULTIPLIER[pet.stage];
  for (const s of STATS) base[s] *= m;
  return base;
}

/** Stats before the condition bonus. */
export function petStats(pet: PetState): StatBlock {
  const base = petBaseStats(pet);
  const out = {} as StatBlock;
  for (const s of STATS) out[s] = statValue(base[s], pet.statGrowth[s]);
  return out;
}

export function defaultLoadout(pet: PetState): SkillId[] {
  const types = petTypes(pet);
  const own = TYPE_SKILL[types[types.length - 1]!];
  const ult = ULTIMATE[types[types.length - 1]!];
  return ["tackle", TYPE_SKILL[pet.starter], pet.stage === "adult" && own !== TYPE_SKILL[pet.starter] ? own : "guard", ult];
}

/**
 * Validate a 4-skill loadout. `known` is every skill the pet can use (own skills plus ones learned from wild
 * monsters). At least two must match the pet's own types.
 */
export function validateLoadout(pet: PetState, loadout: SkillId[], known: SkillId[]): string | null {
  if (loadout.length !== 4) return "A loadout has exactly 4 skills";
  if (new Set(loadout).size !== 4) return "Skills must be different";
  const unknown = loadout.find((id) => !known.includes(id));
  if (unknown) return `Skill ${unknown} has not been learned`;
  const types = petTypes(pet);
  const ownTyped = loadout.filter((id) => {
    const t = getSkill(id).type;
    return t !== null && types.includes(t);
  }).length;
  if (ownTyped < 2) return "At least 2 skills must match the pet's own type";
  return null;
}

export function knownSkills(pet: PetState, learnedFromWild: SkillId[]): SkillId[] {
  const own = new Set<SkillId>(["tackle", "guard", "rest", "chill", ...defaultLoadout(pet)]);
  for (const t of petTypes(pet)) {
    own.add(TYPE_SKILL[t]);
    own.add(ULTIMATE[t]);
  }
  for (const id of learnedFromWild) own.add(id);
  return [...own];
}

export interface Combatant {
  name: string;
  types: ElementType[];
  stats: StatBlock;
  skills: Skill[];
  tactic: Tactic;
  /** Condition bonus. Applied to damage only, because multiplying every stat compounds into a much larger edge. */
  damageBonus?: number;
}

export type Tactic = "aggressive" | "balanced" | "cautious";

export function petCombatant(
  pet: PetState,
  opts: { loadout?: SkillId[]; tactic?: Tactic; recentQualities?: number[] },
  cfg: EngineConfig,
): Combatant {
  return {
    name: pet.id,
    types: petTypes(pet),
    stats: petStats(pet),
    skills: (opts.loadout ?? defaultLoadout(pet)).map(getSkill),
    tactic: opts.tactic ?? "balanced",
    damageBonus: conditionMultiplier(opts.recentQualities ?? [], cfg),
  };
}
