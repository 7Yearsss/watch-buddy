import type { DailyHealth, EchoType, Personality } from "@pulseling/engine";
import { typeMsg } from "./text";
import { cat, lines, msg, type Msg } from "./i18n";
import { zh } from "./copy/zh";

export type ReplyId = "pet" | "cheer" | "sleep-early" | "move" | "tired";

const REPLY_IDS: ReplyId[] = ["pet", "cheer", "sleep-early", "move", "tired"];
/** The quick replies, with Chinese labels for the prototype; the server sends replyLabel() in the request's language. */
export const REPLIES: { id: ReplyId; label: string }[] = REPLY_IDS.map((id) => ({ id, label: zh[`reply.${id}`]! }));
export const replyLabel = (id: ReplyId): Msg => msg(`reply.${id}`);

export const CHATS_PER_DAY = 3;

export const replyLine = (p: Personality, id: ReplyId): Msg => msg(`reply.${id}.${p}`);

export type PromiseKind = "sleep" | "move";

export function promiseKept(kind: PromiseKind, day: DailyHealth): boolean {
  if (!day.worn) return false;
  if (kind === "sleep") return (day.sleepMinutes ?? 0) >= 420;
  return (day.cardioMinutes ?? 0) + (day.strengthMinutes ?? 0) + (day.highIntensityMinutes ?? 0) >= 20 || (day.steps ?? 0) >= 10000;
}

export function promiseLine(p: Personality, kind: PromiseKind, kept: boolean): Msg {
  return msg(`promise.${kept ? "kept" : "missed"}.${p}`, { did: msg(`promise.did.${kind}`), do: msg(`promise.do.${kind}`) });
}

const weekday = (date: string): Msg => msg(`weekday.${new Date(`${date}T00:00:00Z`).getUTCDay()}`);

export interface LetterInput {
  personality: Personality;
  days: DailyHealth[];
  growth: number;
  /** Species ids caught this week. */
  captures: string[];
  bossType: EchoType;
  bossWon: boolean;
  bossAdvantage: "bossAdvantage" | "neutral" | "petAdvantage";
  nextBossType: EchoType;
  /** A known skill that beats the boss type. */
  counterHint: string | null;
}

/** A weekly letter that tells the causal story: what you did → how I grew → how the boss went → what to do next. */
export function weeklyLetter(x: LetterInput): Msg {
  const worn = x.days.filter((d) => d.worn);
  const avg = (k: keyof DailyHealth) => {
    const v = worn.map((d) => d[k]).filter((n): n is number => typeof n === "number");
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };
  const sleep = Math.round(avg("sleepMinutes"));
  // Most people charge the watch at night; with only a night or two of sleep data, say nothing about sleep rather than guess.
  const knowsSleep = worn.filter((d) => typeof d.sleepMinutes === "number").length >= 3;
  const shortSleep = knowsSleep && sleep < 420;
  const steps = Math.round(avg("steps") / 100) * 100;
  const workouts = worn.filter((d) => (d.cardioMinutes ?? 0) + (d.strengthMinutes ?? 0) + (d.highIntensityMinutes ?? 0) >= 20);
  const best = [...worn].sort(
    (a, b) => (b.cardioMinutes ?? 0) + (b.strengthMinutes ?? 0) + (b.highIntensityMinutes ?? 0) - ((a.cardioMinutes ?? 0) + (a.strengthMinutes ?? 0) + (a.highIntensityMinutes ?? 0)),
  )[0];
  const bestSleep = [...worn].sort((a, b) => (b.sleepMinutes ?? 0) - (a.sleepMinutes ?? 0))[0];

  const week = knowsSleep
    ? msg("letter.week.sleep", { h: Math.floor(sleep / 60), m: sleep % 60, steps, workouts: workouts.length })
    : msg("letter.week", { steps, workouts: workouts.length });
  const g = Math.round(x.growth);
  const growth = x.captures.length ? msg("letter.growth.captures", { g, list: x.captures.map((id) => msg(`species.${id}`)) }) : msg("letter.growth", { g });

  const type = typeMsg(x.bossType);
  let boss: Msg;
  if (x.bossWon) {
    let why: Msg | string = "";
    if (workouts.length && best) why = msg("letter.why.workout", { day: weekday(best.date) });
    else if (bestSleep && (bestSleep.sleepMinutes ?? 0) >= 450) why = msg("letter.why.sleep", { day: weekday(bestSleep.date) });
    boss = msg("letter.won", { type, why });
  } else {
    const why =
      x.bossAdvantage === "bossAdvantage"
        ? x.counterHint ? msg("letter.why.counter", { skill: msg(`skill.${x.counterHint}`) }) : msg("letter.why.counterNone")
        : shortSleep ? msg("letter.why.shortSleep") : msg("letter.why.strong");
    boss = msg("letter.lost", { type, why });
  }
  const tip = msg(shortSleep ? "letter.tip.sleep" : workouts.length < 2 ? "letter.tip.move" : "letter.tip.keep");
  return lines(msg(`letter.open.${x.personality}`), "", cat(week, growth), boss, msg("letter.next", { type: typeMsg(x.nextBossType), tip }), "", msg(`letter.close.${x.personality}`));
}
