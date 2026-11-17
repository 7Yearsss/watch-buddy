import type { ElementType } from "./types";

/** Each type beats exactly two others and is beaten by exactly two. Dragon also beats dragon. */
export const BEATS: Record<ElementType, ElementType[]> = {
  grass: ["water", "ground"],
  water: ["fire", "ground"],
  fire: ["grass", "shadow"],
  electric: ["water", "flying"],
  ground: ["electric", "fire"],
  flying: ["grass", "fighting"],
  fighting: ["shadow", "electric"],
  shadow: ["dragon", "flying"],
  dragon: ["dragon", "fighting"],
};

// Softer than ×2 / ×0.5: in 1v1 battles with no switching, ×2 made bad matchups unwinnable. Pokémon GO uses 1.6 / 0.625 for the same reason.
export const SUPER = 1.6;
export const RESISTED = 0.625;

function single(attack: ElementType, defend: ElementType): number {
  if (BEATS[attack].includes(defend)) return SUPER;
  if (BEATS[defend].includes(attack)) return RESISTED;
  return 1;
}

/** Multiplier for an attack of `attack` type against a (possibly dual-typed) defender. Dual types average, so the max stays ×2. `null` is a typeless move. */
export function effectiveness(attack: ElementType | null, defender: ElementType[]): number {
  if (attack === null || defender.length === 0) return 1;
  return defender.reduce((s, t) => s + single(attack, t), 0) / defender.length;
}
