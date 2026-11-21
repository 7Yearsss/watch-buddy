import type { Affinity } from "./affinity";
import type { EngineConfig } from "./config";
import { createRng, type Rng } from "./rng";
import { TYPE_SKILL, type SkillId } from "./skills";
import type { StatBlock } from "./species";
import { RARITIES, type EchoScores, type ElementType, type Rarity } from "./types";

export interface WildSpecies {
  id: string;
  type: ElementType;
  rarity: Rarity;
  /** Shape of the stat spread; totals 250 like every species. */
  base: StatBlock;
  teaches: SkillId;
}

const wild = (id: string, type: ElementType, rarity: Rarity, base: StatBlock): WildSpecies => ({
  id,
  type,
  rarity,
  base,
  teaches: TYPE_SKILL[type],
});

/** MVP roster: 18 species, 9 common / 6 rare / 3 epic. Uncommon and legendary are reserved for events. Names are placeholders until the art is done. */
export const WILD_ROSTER: WildSpecies[] = [
  wild("sprout", "grass", "common", { hp: 60, recovery: 50, attack: 45, speed: 45, defense: 50 }),
  wild("puddle", "water", "common", { hp: 55, recovery: 55, attack: 45, speed: 45, defense: 50 }),
  wild("spark", "fire", "common", { hp: 50, recovery: 40, attack: 60, speed: 55, defense: 45 }),
  wild("zap", "electric", "common", { hp: 45, recovery: 40, attack: 55, speed: 65, defense: 45 }),
  wild("pebble", "ground", "common", { hp: 60, recovery: 40, attack: 50, speed: 35, defense: 65 }),
  wild("knuckle", "fighting", "common", { hp: 55, recovery: 40, attack: 65, speed: 45, defense: 45 }),
  wild("feather", "flying", "common", { hp: 45, recovery: 45, attack: 50, speed: 65, defense: 45 }),
  wild("murk", "shadow", "common", { hp: 50, recovery: 55, attack: 50, speed: 50, defense: 45 }),
  wild("wyrmling", "dragon", "common", { hp: 50, recovery: 50, attack: 50, speed: 50, defense: 50 }),
  wild("thornback", "grass", "rare", { hp: 55, recovery: 45, attack: 55, speed: 40, defense: 55 }),
  wild("coralis", "water", "rare", { hp: 60, recovery: 60, attack: 40, speed: 40, defense: 50 }),
  wild("cinderfox", "fire", "rare", { hp: 45, recovery: 40, attack: 60, speed: 65, defense: 40 }),
  wild("voltail", "electric", "rare", { hp: 50, recovery: 45, attack: 60, speed: 60, defense: 35 }),
  wild("dunemole", "ground", "rare", { hp: 65, recovery: 45, attack: 55, speed: 30, defense: 55 }),
  wild("brawlbit", "fighting", "rare", { hp: 60, recovery: 35, attack: 70, speed: 45, defense: 40 }),
  wild("skylark", "flying", "epic", { hp: 45, recovery: 45, attack: 55, speed: 70, defense: 35 }),
  wild("umbra", "shadow", "epic", { hp: 50, recovery: 60, attack: 55, speed: 50, defense: 35 }),
  wild("elderwyrm", "dragon", "epic", { hp: 55, recovery: 50, attack: 55, speed: 45, defense: 45 }),
];

export interface EncounterInput {
  userId: string;
  date: string;
  daysSinceLastEncounter: number;
  /** Recent lifestyle affinity (e.g. last 7 days). */
  affinity: Affinity;
  /** Yesterday's echoes. */
  echoes: EchoScores;
  weeklyEnergyFraction: number;
  /** Dragons are far more likely when the dragon lifestyle condition holds; otherwise they are rare. */
  dragonEligible: boolean;
}

export interface Encounter {
  species: WildSpecies;
  shiny: boolean;
}

function weighted<T>(rng: Rng, items: T[], weight: (t: T) => number): T | undefined {
  const total = items.reduce((s, t) => s + weight(t), 0);
  if (total <= 0) return undefined;
  let r = rng() * total;
  for (const t of items) {
    r -= weight(t);
    if (r < 0) return t;
  }
  return items[items.length - 1];
}

/** Morning roll. Deterministic per user and day. The wild type leans towards how you have been living. */
export function rollEncounter(input: EncounterInput, cfg: EngineConfig, roster = WILD_ROSTER): Encounter | null {
  const e = cfg.encounter;
  const rng = createRng(`${input.userId}:${input.date}:encounter`);
  const guaranteed = input.daysSinceLastEncounter >= e.pityDays;
  if (!guaranteed && rng() >= e.chance) return null;

  const pool = roster;
  const boost = 1 + e.weeklyRareBoost * input.weeklyEnergyFraction;
  const available = RARITIES.filter((r) => pool.some((s) => s.rarity === r));
  const rarity = weighted(rng, available, (r) => e.rarityWeights[r] * (r === "common" ? 1 : boost)) ?? "common";

  const typeWeight = (t: ElementType) =>
    t === "dragon"
      ? input.dragonEligible
        ? e.typeWeight.base + e.typeWeight.affinity
        : e.dragonBaseWeight
      : e.typeWeight.base +
        e.typeWeight.affinity * (t === "water" || t === "shadow" ? Math.max(input.affinity[t], e.sleepTypeAffinityFloor) : input.affinity[t]) +
        e.typeWeight.echo * Math.max(0, input.echoes[t] ?? 0);
  const species = weighted(rng, pool.filter((s) => s.rarity === rarity), (s) => typeWeight(s.type));
  if (!species) return null;

  return { species, shiny: rng() < 1 / e.shinyOdds };
}
