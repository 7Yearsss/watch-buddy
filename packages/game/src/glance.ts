import type { GameState } from "./state";
import { speciesName } from "./text";
import { SURPRISE_LABEL } from "./surprise";

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
export function morningNotice(s: GameState, f: Facts): Notice | null {
  const m = s.morning;
  if (!m || s.trial === "offered") return null;
  // Someone who hasn't opened the app for 2+ days doesn't get a daily ping; only the two absence notes.
  if (f.daysAway >= 2) return null;
  const name = speciesName(m.trial.opponentName);
  const [text, note] = f.evolveReady
    ? ["我好像要进化了……快来看看！", "优先级 1：可以进化"]
    : m.newSpecies
      ? [`我收服了${name}！`, "优先级 2：新收服"]
      : f.bossToday
        ? f.bossPending ? ["这周的 Boss 来了！点我开打", "优先级 3：Boss 日（等你点开打）"] : [f.bossWon ? "我打赢了这周的 Boss！" : "这周的 Boss 好强，我尽力了", "优先级 3：Boss 结果（输了也不说“失败”）"]
        : f.lettersUnread
          ? ["我给你写了一封信", "优先级 4：周信"]
          : m.encounter
            ? [`今天碰到了${name}`, "优先级 5：遇到野怪"]
            : m.surprise
              ? [m.surprise.short, `优先级 6：${SURPRISE_LABEL[m.surprise.kind]}`]
              : ["早上好～", "兜底"];
  return { time: "07:30", channel: "morning", text: clip(text), note: `${note} · 时间按你平时起床的时间` };
}

/**
 * Absence: gentle, only twice, then silence. Duolingo-style guilt is explicitly out: it works short-term but
 * trains people to turn notifications off entirely.
 */
export function absenceNotice(f: Facts): Notice | null {
  if (f.daysAway === 3) return { time: "19:00", channel: "absence", text: "我梦见你了，梦里我们在散步", note: "离开 3 天：一次，温柔，不提连胜" };
  if (f.daysAway === 7) return { time: "19:00", channel: "absence", text: "我还在这儿，等你回来", note: "离开 7 天：最后一次，之后不再发" };
  return null;
}

export function noticesFor(s: GameState, f: Facts, friendsResult?: string): Notice[] {
  const out: Notice[] = [];
  const morning = morningNotice(s, f);
  if (morning) out.push(morning);
  if (friendsResult) out.push({ time: "现在", channel: "friends", text: clip(friendsResult), note: "好友切磋结果（默认关闭）" });
  const away = absenceNotice(f);
  if (away) out.push(away);
  return out;
}

const clip = (t: string) => (t.length > NOTICE_MAX_CHARS ? t.slice(0, NOTICE_MAX_CHARS - 1) + "…" : t);

/** Smart Stack: relevance decides whether our card floats to the top. High only when there is something new. */
export function smartStackRelevance(s: GameState, f: Facts, hour: number): { score: number; reason: string; title: string; line: string } {
  const m = s.morning;
  if (f.evolveReady) return { score: 1, reason: "可以进化", title: "要进化了！", line: "打开看看它会变成什么" };
  if (f.bossPending) return { score: 0.95, reason: "Boss 在等你开打", title: "Boss 来了！", line: "点一下开打" };
  if (f.bossToday && hour < 12) return { score: 0.9, reason: "Boss 日上午", title: f.bossWon ? "打赢了 Boss" : "Boss 好强", line: "看看回放" };
  if (m && hour >= 6 && hour < 10) return { score: 0.8, reason: "早上 6–10 点，有新的早晨卡片", title: "早上开奖", line: m.encounter ? `遇到了${speciesName(m.trial.opponentName)}` : m.surprise?.short ?? "看看今天" };
  if (hour >= 21) return { score: 0.4, reason: "晚上：提醒睡觉的时间到了（不推送，只在叠放里）", title: "该睡啦", line: "早点睡，明早开奖更好" };
  return { score: 0.1, reason: "没什么新鲜事，留在叠放下面", title: "陪着你", line: "" };
}
