import { defaultConfig, type EchoType, type EngineConfig } from "@pulseling/engine";
import type { Locale } from "./i18n";

/**
 * A limited-time event from the remote calendar (docs/design/10 "远程配置"). It changes how mornings roll, never
 * anyone's stats, so missing it costs nothing.
 */
export interface GameEvent {
  id: string;
  /** Shown on the morning card when the event changed that morning, e.g. "初雪周：水系野怪变多了". Per language, or one string (Chinese). */
  text: string | Partial<Record<Locale, string>>;
  /** First and last morning it applies to (inclusive, YYYY-MM-DD). */
  start: string;
  end: string;
  effect: {
    /** Multiplies the daily chance of meeting a wild monster (capped at 90 %). */
    encounterChance?: number;
    /** Wild monsters lean towards this type, like the weather surprise. */
    weather?: EchoType;
  };
}

/**
 * A feature switch or an A/B test. Each player lands in one variant, picked from a hash of their id and the flag
 * name, so the same player always gets the same variant and different flags split independently.
 */
export interface Flag {
  /** Variant name → value, e.g. { day3: 3, day6: 6 }. */
  variants: Record<string, unknown>;
  /** Variant name → share; missing means equal shares. */
  weights?: Record<string, number>;
}

/** Everything the server can change without an app release. Every settled day records the version it used. */
export interface GameConfig {
  version: string;
  engine: EngineConfig;
  events: GameEvent[];
  flags: Record<string, Flag>;
  /** Copy overrides per language, key → template (same keys and params as packages/game/src/copy). */
  copy?: Partial<Record<Locale, Record<string, string>>>;
}

export const BUILTIN_CONFIG: GameConfig = { version: "builtin", engine: defaultConfig, events: [], flags: {} };

let current: GameConfig = BUILTIN_CONFIG;

/** The config the game rules read right now. */
export const activeConfig = (): GameConfig => current;

/**
 * Run game rules under a given config. All rules are synchronous, so the scope can't leak into another request
 * even when one server process handles many players.
 */
export function withConfig<T>(config: GameConfig, run: () => T): T {
  const previous = current;
  current = config;
  try {
    return run();
  } finally {
    current = previous;
  }
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Which variant of a flag this player is in, or null when the flag isn't set (the built-in behaviour applies). */
export function variantOf(name: string, userId: string, config: GameConfig = current): string | null {
  const f = config.flags[name];
  if (!f) return null;
  const names = Object.keys(f.variants);
  if (!names.length) return null;
  const weights = names.map((n) => Math.max(0, f.weights?.[n] ?? 1));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let point = (hash(`${userId}:${name}`) / 2 ** 32) * total;
  for (let i = 0; i < names.length; i++) {
    point -= weights[i]!;
    if (point < 0) return names[i]!;
  }
  return names[names.length - 1]!;
}

/** The flag's value for this player, or `fallback` when the flag isn't set. */
export function flag<T>(name: string, userId: string, fallback: T, config: GameConfig = current): T {
  const v = variantOf(name, userId, config);
  return v === null ? fallback : (config.flags[name]!.variants[v] as T);
}

/** Every flag this player is in, as name → variant (for analytics and the debug panel). */
export const assignments = (userId: string, config: GameConfig = current) =>
  Object.fromEntries(Object.keys(config.flags).map((n) => [n, variantOf(n, userId, config)]).filter(([, v]) => v !== null)) as Record<string, string>;

export const eventsOn = (date: string, config: GameConfig = current) => config.events.filter((e) => e.start <= date && date <= e.end);

type DeepPartial<T> = { [K in keyof T]?: T[K] extends Record<string, unknown> ? DeepPartial<T[K]> : T[K] };

/** Built-in numbers with a remote override on top: only the fields the override names change. */
export function mergeEngine(base: EngineConfig, override: DeepPartial<EngineConfig> | undefined): EngineConfig {
  const merge = (a: unknown, b: unknown): unknown => {
    if (b === undefined) return a;
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
      for (const [k, v] of Object.entries(b)) out[k] = merge((a as Record<string, unknown>)[k], v);
      return out;
    }
    return b;
  };
  return merge(base, override) as EngineConfig;
}

export type EngineOverride = DeepPartial<EngineConfig>;
