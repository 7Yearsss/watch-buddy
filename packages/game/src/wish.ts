import type { DailyHealth } from "@pulseling/engine";

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
  text: string;
  /** Watch-sized (≈10 chars). */
  short: string;
  kept?: boolean;
  /** What keeping it gave: growth only, or growth + a luckier morning. */
  reward?: "growth" | "luck";
}

export const WISH_LABEL: Record<WishKind, string> = { wear: "陪我睡一晚", walk: "多走走", early: "早点睡", sleep: "睡够", move: "动一动", stairs: "爬爬楼" };

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

interface Candidate { kind: WishKind; target: number; text: string; short: string }

function candidates(history: DailyHealth[]): Candidate[] {
  const out: Candidate[] = [];
  const steps = base(history, (d) => d.steps);
  const walk = Math.max(3000, round(Math.max((steps ?? 4000) * 1.1, (steps ?? 4000) + 500), 100));
  out.push({ kind: "walk", target: walk, text: `今天想多出去走走，我们走到 ${walk} 步好不好？`, short: `想走${walk}步` });

  const bed = base(history, (d) => d.bedtimeMinutes);
  if (bed !== undefined) {
    const target = bed - 15;
    out.push({ kind: "early", target, text: `今晚想早点睡，${clock(target)} 前一起躺下好吗？`, short: `${clock(target)}前睡` });
  }
  const sleep = base(history, (d) => d.sleepMinutes);
  if (sleep !== undefined && sleep < 480) {
    const target = Math.min(540, round(sleep + 15, 5));
    const hm = `${Math.floor(target / 60)} 小时${target % 60 ? ` ${target % 60} 分` : ""}`;
    out.push({ kind: "sleep", target, text: `今晚想多睡一会儿，睡够 ${hm}吧`, short: `睡够${Math.round(target / 6) / 10}小时` });
  }
  const moved = base(history, activeMinutes);
  const move = Math.max(15, round((moved ?? 0) + 5, 5));
  out.push({ kind: "move", target: move, text: `想听你心跳快一点！今天运动 ${move} 分钟可以吗？`, short: `运动${move}分钟` });

  const flights = base(history, (d) => d.flightsClimbed);
  const stairs = Math.max(5, Math.round((flights ?? 2) + 2));
  out.push({ kind: "stairs", target: stairs, text: `今天想爬高高，我们爬 ${stairs} 层楼吧`, short: `爬${stairs}层楼` });
  return out;
}

/** The first night's onboarding ask (02: "戴着手表睡一晚"). */
export function firstWish(date: string): Wish {
  return { date, kind: "wear", target: 1, text: "今晚戴着手表睡觉吧，明天早上我有东西给你看", short: "戴表陪我睡" };
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
export function wishResultLine(w: Wish): { text: string; short: string } {
  if (w.kept)
    return w.reward === "luck"
      ? { text: `你实现了我的心愿「${WISH_LABEL[w.kind]}」！作为谢礼，今早的运气变好了`, short: "心愿实现！好运+" }
      : { text: `你实现了我的心愿「${WISH_LABEL[w.kind]}」！成长值 +${WISH_GROWTH}`, short: "心愿实现啦！" };
  return { text: `心愿「${WISH_LABEL[w.kind]}」没实现也没关系，能陪着你就很开心`, short: "没关系～" };
}
