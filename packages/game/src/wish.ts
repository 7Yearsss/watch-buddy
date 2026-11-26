import type { DailyHealth } from "@pulseling/engine";
import { duration, msg, type Msg } from "./i18n";
import { zh } from "./copy/zh";

/**
 * Daily wishes (07 §2): an optional one-a-day ask in the pet's voice. Targets are relative to the player's own
 * recent days, so 3,000-step people and marathoners both get a reachable ask. Missing one never costs anything.
 */
export type WishKind = "wear" | "walk" | "early" | "sleep" | "move" | "stairs";

export interface Wish {
  /** The day the wish is for (checked against that day's data). */
  date: string;
  kind: WishKind;
  target: number;
  text: Msg;
  /** Watch-sized (≈10 chars). */
  short: Msg;
  kept?: boolean;
  /** What keeping it gave: growth only, or growth + a luckier morning. */
  reward?: "growth" | "luck";
}

/** Chinese labels for the prototype; other surfaces render msg(`wish.<kind>`). */
export const WISH_LABEL = Object.fromEntries((["wear", "walk", "early", "sleep", "move", "stairs"] as const).map((k) => [k, zh[`wish.${k}`]!])) as Record<WishKind, string>;

/** Chance that a morning brings a wish at all; quiet days keep it from feeling like homework. */
export const WISH_CHANCE = 0.7;
export const WISH_GROWTH = 6;
/** Share of kept wishes that also double the next morning's encounter chance. */
export const WISH_LUCK_SHARE = 0.3;

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
const unit = (key: string) => (hash(key) % 10000) / 10000;

const median = (xs: number[]) => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const round = (v: number, step: number) => Math.round(v / step) * step;
const activeMinutes = (d: DailyHealth) => Math.max(d.cardioMinutes ?? 0, d.highIntensityMinutes ?? 0) + (d.strengthMinutes ?? 0);
const clock = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

/** Personal baseline from the last 14 worn days; undefined when there aren't enough days to be fair. */
function base(history: DailyHealth[], f: (d: DailyHealth) => number | undefined): number | undefined {
  const xs = history.slice(-14).filter((d) => d.worn).map(f).filter((v): v is number => v !== undefined);
  return xs.length >= 5 ? median(xs) : undefined;
}

interface Candidate { kind: WishKind; target: number; text: Msg; short: Msg }
const ask = (kind: WishKind, target: number, p: Record<string, Msg | string | number>): Candidate => ({ kind, target, text: msg(`wish.${kind}.text`, p), short: msg(`wish.${kind}.short`, p) });

function candidates(history: DailyHealth[]): Candidate[] {
  const out: Candidate[] = [];
  const steps = base(history, (d) => d.steps);
  const walk = Math.max(3000, round(Math.max((steps ?? 4000) * 1.1, (steps ?? 4000) + 500), 100));
  out.push(ask("walk", walk, { n: walk }));

  const bed = base(history, (d) => d.bedtimeMinutes);
  if (bed !== undefined) {
    const target = bed - 15;
    out.push(ask("early", target, { clock: clock(target) }));
  }
  const sleep = base(history, (d) => d.sleepMinutes);
  if (sleep !== undefined && sleep < 480) {
    const target = Math.min(540, round(sleep + 15, 5));
    out.push(ask("sleep", target, { d: duration(target), h: Math.round(target / 6) / 10 }));
  }
  const moved = base(history, activeMinutes);
  const move = Math.max(15, round((moved ?? 0) + 5, 5));
  out.push(ask("move", move, { n: move }));

  const flights = base(history, (d) => d.flightsClimbed);
  const stairs = Math.max(5, Math.round((flights ?? 2) + 2));
  out.push(ask("stairs", stairs, { n: stairs }));
  return out;
}

/** The first night's onboarding ask (02: "戴着手表睡一晚"). */
export function firstWish(date: string): Wish {
  return { date, ...ask("wear", 1, {}) };
}

/** Maybe a wish for `date`. Deterministic per user and day; never the same kind within 3 days. */
export function pickWish(userId: string, date: string, history: DailyHealth[], recent: Wish[]): Wish | null {
  if (unit(`${userId}:${date}:wish`) >= WISH_CHANCE) return null;
  const recentKinds = new Set(recent.slice(0, 3).map((w) => w.kind));
  const pool = candidates(history).filter((c) => !recentKinds.has(c.kind));
  if (!pool.length) return null;
  const c = pool[hash(`${userId}:${date}:wish-kind`) % pool.length]!;
  return { date, ...c };
}

/** Did the day's data meet the wish? */
export function wishKept(w: Wish, day: DailyHealth): boolean {
  if (!day.worn) return false;
  switch (w.kind) {
    case "wear": return (day.sleepMinutes ?? 0) > 0;
    case "walk": return (day.steps ?? 0) >= w.target;
    case "early": return day.bedtimeMinutes !== undefined && day.bedtimeMinutes <= w.target;
    case "sleep": return (day.sleepMinutes ?? 0) >= w.target;
    case "move": return activeMinutes(day) >= w.target;
    case "stairs": return (day.flightsClimbed ?? 0) >= w.target;
  }
}

export function wishReward(userId: string, w: Wish): "growth" | "luck" {
  return unit(`${userId}:${w.date}:wish-reward`) < WISH_LUCK_SHARE ? "luck" : "growth";
}

/** What the pet says the next morning. Missing a wish is fine and is said kindly. */
export function wishResultLine(w: Wish): { text: Msg; short: Msg } {
  const label = msg(`wish.${w.kind}`);
  const key = w.kept ? (w.reward === "luck" ? "wish.kept.luck" : "wish.kept.growth") : "wish.missed";
  return { text: msg(key, { label, n: WISH_GROWTH }), short: msg(`${key}.short`) };
}
