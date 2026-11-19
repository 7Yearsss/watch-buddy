import type { EchoType, Stat } from "@pulseling/engine";
import type { GameState } from "./state";
import { speciesName, STAT_NAME } from "./text";
import { SURPRISE_ICON, SURPRISE_LABEL } from "./surprise";
import { WISH_LABEL, wishResultLine } from "./wish";

/** The morning card (07 §1): last night → yesterday's highlights → growth → surprise. At most 3 numbers. */
export interface MorningCard {
  date: string;
  night: { icon: "good" | "ok" | "short" | "none"; text: string };
  /** Up to 2. Only the first carries a number; the second uses an arrow. */
  highlights: string[];
  /** Watch-sized version of the first highlight. */
  headline: string;
  gain: number;
  /** Evolution bar before/after, 0–1. */
  from: number;
  to: number;
  surprise: { kind: "capture" | "seen" | "escaped" | "small"; label: string; text: string; short: string };
  /** Extra news lines: yesterday's wish, an opened treasure chest, why the encounter was different. */
  extras: { text: string; good: boolean }[];
  /** Today's optional wish. */
  wish?: { label: string; text: string; short: string };
}

const STAT_OF: Record<EchoType, Stat> = {
  grass: "hp", water: "recovery", shadow: "recovery", fire: "attack", fighting: "attack",
  flying: "speed", electric: "speed", ground: "defense",
};

/** What the player did, said relative to themselves — never an absolute ranking. */
function action(t: EchoType, strong: boolean): string {
  const more = strong ? "比平时多很多" : "比平时多";
  switch (t) {
    case "grass": return `走路${more}`;
    case "water": return strong ? "睡得比平时好很多" : "睡得比平时好";
    case "shadow": return "深睡比平时足";
    case "fire": return `活动量${more}`;
    case "fighting": return `力量训练${more}`;
    case "flying": return `有氧运动${more}`;
    case "electric": return `高强度运动${more}`;
    case "ground": return `爬楼${more}`;
  }
}

const hm = (min: number) => `${Math.floor(min / 60)} 时 ${String(min % 60).padStart(2, "0")} 分`;

export function morningCard(s: GameState, progress: number, threshold: number): MorningCard | null {
  const m = s.morning;
  const day = s.history[s.history.length - 1];
  const result = s.results[s.results.length - 1];
  if (!m || !day || !result) return null;

  const sleep = day.worn ? day.sleepMinutes : undefined;
  const night: MorningCard["night"] =
    sleep === undefined
      ? { icon: "none", text: "昨晚没戴手表睡觉" }
      : { icon: sleep >= 420 ? "good" : sleep >= 360 ? "ok" : "short", text: hm(sleep) };

  const ranked = (Object.entries(result.echoes) as [EchoType, number][])
    .filter(([, v]) => v > 0.15)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);
  const highlights = ranked.map(([t, v], i) => {
    const stat = STAT_OF[t];
    const gain = Math.round(result.statGains[stat]);
    return `${action(t, v > 0.5)} → ${STAT_NAME[stat]}${i === 0 ? ` +${gain}` : " ↑"}`;
  });
  if (!highlights.length) {
    // Never an empty card, never a scolding one.
    highlights.push(day.worn ? `戴着手表陪了我一整天 → 成长不停` : "昨天没戴手表，我自己玩了一天");
  }

  const gain = Math.round(result.gain);
  const to = threshold ? Math.min(1, progress / threshold) : 1;
  const from = threshold ? Math.max(0, (progress - result.gain) / threshold) : 1;

  const name = speciesName(m.trial.opponentName);
  const sp = m.surprise;
  const surprise: MorningCard["surprise"] = !m.encounter
    ? sp
      ? { kind: "small", label: `${SURPRISE_ICON[sp.kind]} ${SURPRISE_LABEL[sp.kind]}`, text: sp.text, short: sp.short }
      : { kind: "small", label: "惊喜", text: "附近很安静", short: "附近很安静" }
    : m.newSpecies
      ? { kind: "capture", label: "遇到野怪", text: `收服了${name}！`, short: `收服了${name}！` }
      : m.captured
        ? { kind: "seen", label: "遇到野怪", text: `又碰到了${name}`, short: `又碰到${name}` }
        : { kind: "escaped", label: "遇到野怪", text: `${name}跑掉了，图鉴里留下了剪影`, short: `${name}跑掉了` };

  const extras: MorningCard["extras"] = [];
  if (m.wishResult) extras.push({ text: wishResultLine(m.wishResult).text, good: !!m.wishResult.kept });
  if (m.treasure) extras.push({ text: `宝箱打开了！得到「${m.treasure.item}」，成长值 +${m.treasure.growth}`, good: true });
  for (const b of m.boosts ?? []) extras.push({ text: b, good: true });
  const wish = m.wish ? { label: WISH_LABEL[m.wish.kind], text: m.wish.text, short: m.wish.short } : undefined;

  return { date: m.date, night, highlights, headline: highlights[0]!, gain, from, to, surprise, extras, wish };
}
