import { createRng, pick, type Rng } from "./rng";
import { RARITIES, type Cosmetics, type PetState, type Rarity, type RarityUpgrade } from "./types";

/** Hatch odds, same shape as Claude Code's /buddy: 60 / 25 / 10 / 4 / 1. */
export const HATCH_RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1,
};

/** Rarity is a starting point: healthy habits can raise it up to epic. Legendary stays hatch-only. */
export const EARNED_RARITY_CAP: Rarity = "epic";
export const ACTIVE_DAYS_FOR_UPGRADE = 100;

/** Placeholder ids until the art exists. */
export const COSMETIC_POOLS = {
  accessory: ["leaf-cap", "beanie", "tiny-crown", "flower", "headband", "bow", "goggles", "scarf"],
  eyes: ["sparkle", "sleepy", "star", "heart"],
  effect: ["petals", "sparks", "bubbles", "notes"],
  aura: ["pulse-aura"],
} as const;

const LAYERS = ["accessory", "eyes", "effect", "aura"] as const;

export function rollRarity(rng: Rng, weights: Record<Rarity, number> = HATCH_RARITY_WEIGHTS): Rarity {
  const total = RARITIES.reduce((s, r) => s + weights[r], 0);
  let x = rng() * total;
  for (const r of RARITIES) {
    x -= weights[r];
    if (x < 0) return r;
  }
  return "common";
}

/** Each tier adds one visual layer on top of the one below it. */
export function rollCosmetics(rng: Rng, rarity: Rarity): Cosmetics {
  const out: Cosmetics = {};
  const tier = RARITIES.indexOf(rarity);
  for (let i = 0; i < tier; i++) out[LAYERS[i]!] = pick(rng, COSMETIC_POOLS[LAYERS[i]!]);
  return out;
}

export function nextEarnedRarity(r: Rarity): Rarity | null {
  const i = RARITIES.indexOf(r);
  return i < RARITIES.indexOf(EARNED_RARITY_CAP) ? RARITIES[i + 1]! : null;
}

/**
 * Raise rarity one tier for an achievement, once per reason. Adds that tier's visual layer and keeps the
 * existing ones. At the cap the achievement is still recorded but the tier stays.
 */
export function upgradeRarity(pet: PetState, reason: RarityUpgrade): PetState {
  if (pet.rarityUpgrades.includes(reason)) return pet;
  const next = nextEarnedRarity(pet.rarity);
  const rarityUpgrades = [...pet.rarityUpgrades, reason];
  if (!next) return { ...pet, rarityUpgrades };
  const layer = LAYERS[RARITIES.indexOf(next) - 1]!;
  const rng = createRng(`${pet.id}:rarity:${next}`);
  return { ...pet, rarity: next, rarityUpgrades, cosmetics: { ...pet.cosmetics, [layer]: pick(rng, COSMETIC_POOLS[layer]) } };
}
