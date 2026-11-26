import type { GameState } from "./state";
import { speciesMsg } from "./text";
import { SURPRISE_LABEL } from "./surprise";
import { msg, t, type Locale, type Msg } from "./i18n";

/**
 * Glanceable surfaces outside the app: notifications and the Smart Stack card.
 * Copy rules (see 07 §4): pet speaks in first person, ≤ 25 characters, specific to today, never guilt or streak threats.
 */
export interface Notice {
  time: string;
  /** Which setting controls it. */
  channel: "morning" | "milestone" | "friends" | "absence";
  text: string;
  /** Why it was sent / held, shown in the prototype only. */
  note: string;
}

export const NOTICE_MAX_CHARS = 25;
/** English runs about 1.8× longer than Chinese for the same line. */
const MAX_CHARS: Record<Locale, number> = { zh: NOTICE_MAX_CHARS, en: 45 };
export const CHANNEL_NAME: Record<Notice["channel"], string> = { morning: "早上开奖", milestone: "进化和收服", friends: "好友", absence: "很久没见" };
export const CHANNEL_DEFAULT: Record<Notice["channel"], boolean> = { morning: true, milestone: true, friends: false, absence: true };

interface Facts {
  evolveReady: boolean;
  bossToday: boolean;
  bossWon: boolean;
  lettersUnread: boolean;
  daysAway: number;
  bossPending?: boolean;
}

/** One morning notification at most: the single most important thing, in priority order. */
export function morningNotice(s: GameState, f: Facts, locale: Locale = "zh"): Notice | null {
  const m = s.morning;
  if (!m) return null;
  // Someone who hasn't opened the app for 2+ days doesn't get a daily ping; only the two absence notes.
  if (f.daysAway >= 2) return null;
  const name = speciesMsg(m.trial.opponentName);
  const [text, note]: [Msg, string] = f.evolveReady
    ? [msg("notice.evolve"), "优先级 1：可以进化"]
    : m.newSpecies
      ? [msg("notice.captured", { name }), "优先级 2：新收服"]
      : f.bossToday
        ? f.bossPending ? [msg("notice.boss.pending"), "优先级 3：Boss 日（等你点开打）"] : [msg(f.bossWon ? "notice.boss.won" : "notice.boss.lost"), "优先级 3：Boss 结果（输了也不说“失败”）"]
        : f.lettersUnread
          ? [msg("notice.letter"), "优先级 4：周信"]
          : m.encounter
            ? [msg("notice.met", { name }), "优先级 5：遇到野怪"]
            : m.surprise
              ? [m.surprise.short, `优先级 6：${SURPRISE_LABEL[m.surprise.kind]}`]
              : [msg("notice.hello"), "兜底"];
  return { time: "07:30", channel: "morning", text: clip(t(text, locale), locale), note: `${note} · 时间按你平时起床的时间` };
}

/**
 * Absence: gentle, only twice, then silence. Duolingo-style guilt is explicitly out: it works short-term but
 * trains people to turn notifications off entirely.
 */
export function absenceNotice(f: Facts, locale: Locale = "zh"): Notice | null {
  if (f.daysAway === 3) return { time: "19:00", channel: "absence", text: t(msg("notice.away3"), locale), note: "离开 3 天：一次，温柔，不提连胜" };
  if (f.daysAway === 7) return { time: "19:00", channel: "absence", text: t(msg("notice.away7"), locale), note: "离开 7 天：最后一次，之后不再发" };
  return null;
}

export function noticesFor(s: GameState, f: Facts, friendsResult?: string, locale: Locale = "zh"): Notice[] {
  const out: Notice[] = [];
  const morning = morningNotice(s, f, locale);
  if (morning) out.push(morning);
  if (friendsResult) out.push({ time: "现在", channel: "friends", text: clip(friendsResult, locale), note: "好友切磋结果（默认关闭）" });
  const away = absenceNotice(f, locale);
  if (away) out.push(away);
  return out;
}

const clip = (text: string, locale: Locale) => (text.length > MAX_CHARS[locale] ? text.slice(0, MAX_CHARS[locale] - 1) + "…" : text);

/** Smart Stack: relevance decides whether our card floats to the top. High only when there is something new. */
export function smartStackRelevance(s: GameState, f: Facts, hour: number, locale: Locale = "zh"): { score: number; reason: string; title: string; line: string } {
  const m = s.morning;
  const T = (k: string, p?: Record<string, Msg>) => t(msg(k, p), locale);
  if (f.evolveReady) return { score: 1, reason: "可以进化", title: T("stack.evolve.title"), line: T("stack.evolve.line") };
  if (f.bossPending) return { score: 0.95, reason: "Boss 在等你开打", title: T("stack.boss.title"), line: T("stack.boss.line") };
  if (f.bossToday && hour < 12) return { score: 0.9, reason: "Boss 日上午", title: T(f.bossWon ? "stack.bossWon.title" : "stack.bossLost.title"), line: T("stack.replay") };
  if (m && hour >= 6 && hour < 10)
    return { score: 0.8, reason: "早上 6–10 点，有新的早晨卡片", title: T("stack.morning.title"), line: m.encounter ? T("stack.met", { name: speciesMsg(m.trial.opponentName) }) : m.surprise ? t(m.surprise.short, locale) : T("stack.look") };
  if (hour >= 21) return { score: 0.4, reason: "晚上：提醒睡觉的时间到了（不推送，只在叠放里）", title: T("stack.night.title"), line: T("stack.night.line") };
  return { score: 0.1, reason: "没什么新鲜事，留在叠放下面", title: T("stack.idle.title"), line: "" };
}
