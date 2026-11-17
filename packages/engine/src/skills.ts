import type { ElementType } from "./types";

export type SkillKind = "attack" | "heal" | "shield" | "slow" | "ultimate";

export interface Skill {
  id: string;
  /** `null` = typeless, never affected by the type chart. */
  type: ElementType | null;
  kind: SkillKind;
  power: number;
}

const typeSkill = (type: ElementType, id: string): Skill => ({ id, type, kind: "attack", power: 50 });
const ultimate = (type: ElementType, id: string): Skill => ({ id, type, kind: "ultimate", power: 100 });

export const SKILLS = {
  tackle: { id: "tackle", type: null, kind: "attack", power: 35 },
  guard: { id: "guard", type: null, kind: "shield", power: 0 },
  rest: { id: "rest", type: null, kind: "heal", power: 30 },
  chill: { id: "chill", type: null, kind: "slow", power: 0 },

  "leaf-cut": typeSkill("grass", "leaf-cut"),
  "tide-push": typeSkill("water", "tide-push"),
  "ember-bite": typeSkill("fire", "ember-bite"),
  "static-jolt": typeSkill("electric", "static-jolt"),
  "rock-stomp": typeSkill("ground", "rock-stomp"),
  "iron-fist": typeSkill("fighting", "iron-fist"),
  "gust-dive": typeSkill("flying", "gust-dive"),
  "night-fang": typeSkill("shadow", "night-fang"),
  "wyrm-claw": typeSkill("dragon", "wyrm-claw"),

  "bloom-storm": ultimate("grass", "bloom-storm"),
  "tidal-crash": ultimate("water", "tidal-crash"),
  "blaze-burst": ultimate("fire", "blaze-burst"),
  "sky-strike": ultimate("flying", "sky-strike"),
  "titan-blow": ultimate("fighting", "titan-blow"),
  "dragon-roar": ultimate("dragon", "dragon-roar"),
  "thunder-dash": ultimate("electric", "thunder-dash"),
  quake: ultimate("ground", "quake"),
  eclipse: ultimate("shadow", "eclipse"),
} satisfies Record<string, Skill>;

export type SkillId = keyof typeof SKILLS;

export const TYPE_SKILL: Record<ElementType, SkillId> = {
  grass: "leaf-cut",
  water: "tide-push",
  fire: "ember-bite",
  electric: "static-jolt",
  ground: "rock-stomp",
  fighting: "iron-fist",
  flying: "gust-dive",
  shadow: "night-fang",
  dragon: "wyrm-claw",
};

export const ULTIMATE: Record<ElementType, SkillId> = {
  grass: "bloom-storm",
  water: "tidal-crash",
  fire: "blaze-burst",
  flying: "sky-strike",
  fighting: "titan-blow",
  dragon: "dragon-roar",
  electric: "thunder-dash",
  ground: "quake",
  shadow: "eclipse",
};

/** Skills of another type than the user hit 10% softer: they patch weaknesses, they don't change identity. */
export const OFF_TYPE_PENALTY = 0.9;

export function getSkill(id: string): Skill {
  const s = (SKILLS as Record<string, Skill>)[id];
  if (!s) throw new Error(`Unknown skill ${id}`);
  return s;
}
