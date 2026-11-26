import type { DailyHealth, EchoScores, EchoType, PetState } from "@pulseling/engine";
import { typeMsg } from "./text";
import { firstClause, msg, type Msg } from "./i18n";
import { zh } from "./copy/zh";

/** Daily small surprises (07 §2): every morning without a wild monster gets one, never the same kind within 3 days. */
export type SurpriseKind = "dream" | "item" | "footprint" | "discovery" | "move" | "meteor" | "guest" | "treasure" | "weather";

export interface Surprise {
  date: string;
  kind: SurpriseKind;
  text: Msg;
  /** Watch-sized line (≈10 chars). */
  short: Msg;
  /** Item id (copy key item.<id>). */
  item?: string;
  move?: IdleMove;
  /** guest: a wild species that stays the night and is met for sure the next morning. */
  guest?: string;
  /** weather: tomorrow's wild monsters lean towards this type. */
  weather?: EchoType;
  /** treasure: the morning the chest opens. */
  opensOn?: string;
}

const KINDS: SurpriseKind[] = ["dream", "item", "footprint", "discovery", "move", "meteor", "guest", "treasure", "weather"];
/** Chinese labels for the prototype; other surfaces render msg(`surprise.<kind>`). */
export const SURPRISE_LABEL = Object.fromEntries(KINDS.map((k) => [k, zh[`surprise.${k}`]!])) as Record<SurpriseKind, string>;
export const SURPRISE_ICON: Record<SurpriseKind, string> = { dream: "☁", item: "◆", footprint: "∴", discovery: "↗", move: "♪", meteor: "✦", guest: "⌂", treasure: "✉", weather: "☂" };

/** Rare finds from treasure maps; they go into the collection book like other items. */
export const TREASURE_ITEMS = ["map-piece", "golden-acorn", "rainbow-shell", "star-sand", "glowing-stone"];
/** Days between finding a treasure map and the chest opening. */
export const TREASURE_DAYS = 3;
const WEATHER: EchoType[] = ["water", "fire", "flying", "electric"];

/** Collectibles by type. They go into the collection book and never give battle power. */
export const ITEMS: Record<EchoType, string[]> = {
  grass: ["clover", "acorn", "bud"],
  water: ["shell", "dewdrop", "blue-pebble"],
  shadow: ["moonstone", "night-jasmine", "star-shard"],
  fire: ["flint", "warm-ember", "maple-leaf"],
  fighting: ["wristband", "tiny-dumbbell", "glove-buckle"],
  flying: ["white-feather", "dandelion", "pinwheel"],
  electric: ["battery-stone", "copper-wire", "storm-cloud"],
  ground: ["fossil", "pottery-shard", "gold-sand"],
};
/** Item id → its name in Chinese (the prototype's collection book). */
export const itemName = (id: string) => zh[`item.${id}`] ?? id;
export const itemMsg = (id: string): Msg => (zh[`item.${id}`] ? msg(`item.${id}`) : msg("$raw", { zh: id }));
/** Saves from before copy keys stored item names; map them back to ids. */
export const itemIdFromName = (name: string) => Object.entries(zh).find(([k, v]) => k.startsWith("item.") && v === name)?.[0].slice(5) ?? name;

export type IdleMove = "stretch" | "spin" | "hop" | "wave" | "dance";
export const MOVE_NAME = Object.fromEntries((["stretch", "spin", "hop", "wave", "dance"] as const).map((m) => [m, zh[`move.${m}`]!])) as Record<IdleMove, string>;
const MOVES: IdleMove[] = ["stretch", "hop", "spin", "wave", "dance"];

/** What to do more of to meet a type (also used by the dex). */
export const HINT = Object.fromEntries((["grass", "water", "shadow", "fire", "fighting", "flying", "electric", "ground"] as const).map((t) => [t, zh[`hint.${t}`]!])) as Record<EchoType, string>;

/** Three dreams per type: copy keys dream.<type>.0–2, plus dream.plain. */
const DREAMS_PER_TYPE = 3;

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const worn = (days: DailyHealth[]) => days.filter((d) => d.worn);

/** A positive change this week vs last week, said relative to the player. Null if nothing improved. */
function discovery(history: DailyHealth[]): { text: Msg; short: Msg } | null {
  const thisWeek = worn(history.slice(-7));
  const lastWeek = worn(history.slice(-14, -7));
  if (thisWeek.length < 3 || lastWeek.length < 3) return null;
  // Average only the days that have the metric: a night the watch was charging is not a night of zero sleep.
  const known = (days: DailyHealth[], f: (d: DailyHealth) => number | undefined) =>
    days.map(f).filter((v): v is number => typeof v === "number");
  const pick = (f: (d: DailyHealth) => number | undefined) => {
    const now = known(thisWeek, f);
    const then = known(lastWeek, f);
    return now.length >= 3 && then.length >= 3 ? [avg(now), avg(then)] : [0, 0];
  };
  const cands: { score: number; text: Msg; short: Msg }[] = [];
  const say = (key: string, n: number) => ({ text: msg(`discovery.${key}`, { n }), short: msg(`discovery.${key}.short`, { n }) });
  const [bedNow, bedThen] = pick((d) => d.bedtimeMinutes);
  if (bedThen! - bedNow! >= 10) cands.push({ score: (bedThen! - bedNow!) / 30, ...say("bed", Math.round(bedThen! - bedNow!)) });
  const [sleepNow, sleepThen] = pick((d) => d.sleepMinutes);
  if (sleepNow! - sleepThen! >= 10) cands.push({ score: (sleepNow! - sleepThen!) / 30, ...say("sleep", Math.round(sleepNow! - sleepThen!)) });
  const [stepNow, stepThen] = pick((d) => d.steps);
  if (stepThen! > 0 && stepNow! / stepThen! >= 1.08) cands.push({ score: stepNow! / stepThen! - 1, ...say("steps", Math.round((stepNow! / stepThen! - 1) * 100)) });
  const [cardioNow, cardioThen] = pick((d) => d.cardioMinutes);
  if (cardioNow! - cardioThen! >= 3) cands.push({ score: (cardioNow! - cardioThen!) / 10, ...say("cardio", Math.round((cardioNow! - cardioThen!) * thisWeek.length)) });
  cands.sort((a, b) => b.score - a.score);
  return cands[0] ?? null;
}

export interface SurpriseInput {
  userId: string;
  date: string;
  pet: PetState;
  echoes: EchoScores;
  history: DailyHealth[];
  /** Types of wild monsters not captured yet. */
  uncapturedTypes: EchoType[];
  recent: Surprise[];
  /** Date of the last new move, so moves stay rare milestones. */
  lastMoveDate?: string;
  moves: IdleMove[];
  /** Uncaptured wild species that could come to stay the night. */
  guestCandidates?: string[];
  /** A treasure map is already waiting to open. */
  treasurePending?: boolean;
}

export function pickSurprise(x: SurpriseInput): Surprise {
  const top = (Object.entries(x.echoes) as [EchoType, number][]).filter(([, v]) => v > 0.15).sort((a, b) => b[1] - a[1])[0]?.[0];
  const recentKinds = new Set(x.recent.filter((r) => r.date > addDaysStr(x.date, -3)).map((r) => r.kind));
  const disc = discovery(x.history);
  const nextMove = MOVES.find((m) => !x.moves.includes(m));
  // It only dreams on nights it slept on your wrist: a small reward for wearing the watch to bed, never a requirement.
  const sleptWithYou = typeof x.history[x.history.length - 1]?.sleepMinutes === "number";
  const all: { kind: SurpriseKind; w: number }[] = [
    { kind: "dream", w: sleptWithYou ? (top ? 3 : 2) : 0 },
    { kind: "item", w: 3 },
    { kind: "footprint", w: x.uncapturedTypes.length ? 2 : 0 },
    { kind: "discovery", w: disc ? 3 : 0 },
    // New moves come early and then stop, so they feel like milestones.
    { kind: "move", w: nextMove && (!x.lastMoveDate || x.lastMoveDate <= addDaysStr(x.date, -10)) ? 2 : 0 },
    // Events that change tomorrow: rarer, so they still feel like news.
    { kind: "meteor", w: 1 },
    { kind: "guest", w: x.guestCandidates?.length ? 1 : 0 },
    { kind: "treasure", w: x.treasurePending ? 0 : 1 },
    { kind: "weather", w: 1.5 },
  ];
  const pool = all.filter((p) => p.w > 0 && !recentKinds.has(p.kind));
  const choices = pool.length ? pool : [{ kind: "item" as SurpriseKind, w: 1 }];
  const total = choices.reduce((a, p) => a + p.w, 0);
  let r = (hash(`${x.userId}:${x.date}:surprise`) % 1000) / 1000 * total;
  let kind = choices[0]!.kind;
  for (const p of choices) {
    if ((r -= p.w) < 0) { kind = p.kind; break; }
  }
  const h = hash(`${x.userId}:${x.date}:detail`);

  switch (kind) {
    case "dream": {
      const text = top ? msg(`dream.${top}.${h % DREAMS_PER_TYPE}`) : msg("dream.plain");
      // Specific, not vague: the first clause of the dream itself ("我梦见自己在云上跑步…").
      return { date: x.date, kind, text, short: firstClause(text) };
    }
    case "item": {
      const type = top ?? (x.pet.starter as EchoType);
      const list = ITEMS[type];
      const item = list[h % list.length]!;
      return { date: x.date, kind, item, text: msg("surprise.item.text", { item: itemMsg(item) }), short: msg("surprise.item.short", { item: itemMsg(item) }) };
    }
    case "footprint": {
      const type = x.uncapturedTypes[h % x.uncapturedTypes.length]!;
      return { date: x.date, kind, text: msg("surprise.footprint.text", { type: typeMsg(type), hint: msg(`hint.${type}`) }), short: msg("surprise.footprint.short", { type: typeMsg(type) }) };
    }
    case "discovery":
      return { date: x.date, kind, text: disc!.text, short: disc!.short };
    case "move":
      return { date: x.date, kind, move: nextMove!, text: msg("surprise.move.text", { move: msg(`move.${nextMove}`) }), short: msg("surprise.move.short", { move: msg(`move.${nextMove}`) }) };
    case "meteor":
      return { date: x.date, kind, text: msg("surprise.meteor.text"), short: msg("surprise.meteor.short") };
    case "guest": {
      const id = x.guestCandidates![h % x.guestCandidates!.length]!;
      return { date: x.date, kind, guest: id, text: msg("surprise.guest.text"), short: msg("surprise.guest.short") };
    }
    case "treasure": {
      const opensOn = addDaysStr(x.date, TREASURE_DAYS);
      return { date: x.date, kind, opensOn, text: msg("surprise.treasure.text", { n: TREASURE_DAYS }), short: msg("surprise.treasure.short") };
    }
    case "weather": {
      const w = WEATHER[h % WEATHER.length]!;
      return { date: x.date, kind, weather: w, text: msg(`weather.${w}`), short: msg(`weather.${w}.short`) };
    }
  }
}

function addDaysStr(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
