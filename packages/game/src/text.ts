import type { AdultVariant, EchoScores, ElementType, HatchFacts, Personality, Rarity, SkillId, Stat, Tactic } from "@pulseling/engine";
import { duration, msg, t, type Locale, type Msg } from "./i18n";
import { zh } from "./copy/zh";

/** Chinese name tables, for the prototype's fixed UI. Game text goes through msg()/t() so it can be any language. */
const table = <K extends string>(prefix: string, keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, zh[`${prefix}.${k}`]!])) as Record<K, string>;
const TYPES = ["grass", "water", "fire", "electric", "ground", "fighting", "flying", "shadow", "dragon"] as const;
const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const;
export const TYPE_NAME: Record<ElementType, string> = table("type", TYPES);
export const RARITY_NAME: Record<Rarity, string> = table("rarity", RARITIES);
/** Rarity is shown as stars + white light, never hue (07 §3). */
export const RARITY_STARS: Record<Rarity, string> = { common: "★", uncommon: "★★", rare: "★★★", epic: "★★★★", legendary: "★★★★★" };
export const rarityLabel = (r: Rarity, locale: Locale = "zh") => `${RARITY_STARS[r]} ${t(msg(`rarity.${r}`), locale)}`;
export const VARIANT_NAME: Record<AdultVariant, string> = table("variant", ["pure", "flying", "fighting", "ground", "electric", "shadow", "dragon"] as const);
export const STAT_NAME: Record<Stat, string> = table("stat", ["hp", "recovery", "attack", "speed", "defense"] as const);
export const PERSONALITY_NAME: Record<Personality, string> = table("personality", ["genki", "tsundere", "gentle", "chuuni", "chill"] as const);
export const TACTIC_NAME: Record<Tactic, string> = table("tactic", ["aggressive", "balanced", "cautious"] as const);
export const SPECIES_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(zh).filter(([k]) => k.startsWith("species.") && k !== "species.boss").map(([k, v]) => [k.slice(8), v]),
);
export const SKILL_NAME: Record<string, string> = Object.fromEntries(Object.entries(zh).filter(([k]) => k.startsWith("skill.")).map(([k, v]) => [k.slice(6), v]));

/** Name messages: stored in saves instead of finished names, so they read right in every language. */
export const typeMsg = (type: string): Msg => msg(`type.${type}`);
export const speciesMsg = (id: string): Msg =>
  id.startsWith("boss-") ? msg("species.boss", { type: typeMsg(id.slice(5)) }) : zh[`species.${id}`] ? msg(`species.${id}`) : msg("$raw", { zh: id });
export const skillMsg = (id: SkillId | string): Msg => (zh[`skill.${id}`] ? msg(`skill.${id}`) : msg("$raw", { zh: id }));

export const speciesName = (id: string, locale: Locale = "zh") => t(speciesMsg(id), locale);
export const skillName = (id: SkillId | string, locale: Locale = "zh") => t(skillMsg(id), locale);

export function hatchLine(p: Personality, facts: HatchFacts): Msg {
  if (facts.historyDays < 7) return msg(`hatch.new.${p}`);
  const steps = Math.round((facts.avgSteps ?? 0) / 100) * 100;
  const cardio = Math.round(facts.weeklyCardioMinutes ?? 0);
  const fact = cardio >= 60 ? msg("hatch.fact.cardio", { n: cardio }) : msg("hatch.fact.steps", { n: steps });
  return msg(`hatch.known.${p}`, { fact });
}

export type Mood = "happy" | "sleepy" | "bored";

export function moodOf(echoes: EchoScores, sleepMinutes?: number): Mood {
  if ((sleepMinutes ?? 420) < 360 || (echoes.water ?? 0) < -0.3) return "sleepy";
  const active = Math.max(echoes.grass ?? 0, echoes.flying ?? 0, echoes.fighting ?? 0, echoes.fire ?? 0);
  if (active < -0.3) return "bored";
  return "happy";
}

export function morningLine(p: Personality, sleepMinutes: number | undefined, mood: Mood, encounter: boolean, captured: boolean, wildId: string): Msg {
  const sleep = sleepMinutes === undefined ? "" : msg("morning.slept", { d: duration(sleepMinutes) });
  const kind = mood === "sleepy" ? "sleepy" : encounter ? (captured ? "captured" : "escaped") : mood === "bored" ? "bored" : "fine";
  return msg(`morning.${kind}.${p}`, { sleep, wild: speciesMsg(wildId) });
}

/** VoiceOver label for a sprite, e.g. "火系成熟体，史诗，很开心". */
export function describeSprite(spec: { primary: ElementType; secondary?: ElementType | null; stage: string; variant?: string; rarity?: Rarity; shiny?: boolean; action?: string; mood?: string }, locale: Locale = "zh"): string {
  const type = spec.secondary ? msg("sprite.dual", { a: typeMsg(spec.primary), b: typeMsg(spec.secondary) }) : msg("sprite.type", { a: typeMsg(spec.primary) });
  const stage = ["egg", "baby", "juvenile", "adult", "wild"].includes(spec.stage) ? t(msg(`stage.${spec.stage}`), locale) : "";
  const parts = [t(type, locale) + (locale === "zh" ? "" : " ") + stage];
  if (spec.rarity && spec.rarity !== "common") parts.push(t(msg(`rarity.${spec.rarity}`), locale));
  if (spec.shiny) parts.push(t(msg("sprite.shiny"), locale));
  const act = ["talk", "attack", "hit", "sleep"].includes(spec.action ?? "") ? `act.${spec.action}` : ["happy", "sleepy", "bored"].includes(spec.action ?? "") ? `mood.${spec.action}` : ["happy", "sleepy", "bored"].includes(spec.mood ?? "") ? `mood.${spec.mood}` : null;
  if (act) parts.push(t(msg(act), locale));
  return parts.join(t(msg("$comma"), locale));
}
