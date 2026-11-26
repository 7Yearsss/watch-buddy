import type { EchoType, Stat } from "@pulseling/engine";
import type { GameState } from "./state";
import { speciesMsg } from "./text";
import { SURPRISE_ICON } from "./surprise";
import { wishResultLine } from "./wish";
import { msg, t, type Locale, type Msg } from "./i18n";

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
const action = (type: EchoType, strong: boolean): Msg => msg(`card.act.${type}${strong ? ".strong" : ""}`);

const hm = (min: number): Msg => msg("card.hm", { h: Math.floor(min / 60), m: String(min % 60).padStart(2, "0") });

/** The card as text in one language. It is built at read time from the stored morning, so it is never stored itself. */
export function morningCard(s: GameState, progress: number, threshold: number, locale: Locale = "zh"): MorningCard | null {
  const T = (x: Msg) => t(x, locale);
  const m = s.morning;
  const day = s.history[s.history.length - 1];
  const result = s.results[s.results.length - 1];
  if (!m || !day || !result) return null;

  const sleep = day.worn ? day.sleepMinutes : undefined;
  const night: MorningCard["night"] =
    sleep === undefined
      ? { icon: "none", text: T(msg("card.night.none")) }
      : { icon: sleep >= 420 ? "good" : sleep >= 360 ? "ok" : "short", text: T(hm(sleep)) };

  const ranked = (Object.entries(result.echoes) as [EchoType, number][])
    .filter(([, v]) => v > 0.15)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);
  const highlights = ranked.map(([t, v], i) => {
    const stat = STAT_OF[t];
    const gain = Math.round(result.statGains[stat]);
    return T(msg(i === 0 ? "card.highlight.first" : "card.highlight.next", { act: action(t, v > 0.5), stat: msg(`stat.${stat}`), gain }));
  });
  if (!highlights.length) {
    // Never an empty card, never a scolding one.
    highlights.push(T(msg(day.worn ? "card.worn" : "card.unworn")));
  }

  const gain = Math.round(result.gain);
  const to = threshold ? Math.min(1, progress / threshold) : 1;
  const from = threshold ? Math.max(0, (progress - result.gain) / threshold) : 1;

  const name = speciesMsg(m.trial.opponentName);
  const sp = m.surprise;
  const wild = T(msg("card.wild"));
  const surprise: MorningCard["surprise"] = !m.encounter
    ? sp
      ? { kind: "small", label: `${SURPRISE_ICON[sp.kind]} ${T(msg(`surprise.${sp.kind}`))}`, text: T(sp.text), short: T(sp.short) }
      : { kind: "small", label: T(msg("card.quiet.label")), text: T(msg("card.quiet")), short: T(msg("card.quiet")) }
    : m.newSpecies
      ? { kind: "capture", label: wild, text: T(msg("card.captured", { name })), short: T(msg("card.captured", { name })) }
      : m.captured
        ? { kind: "seen", label: wild, text: T(msg("card.seen", { name })), short: T(msg("card.seen.short", { name })) }
        : { kind: "escaped", label: wild, text: T(msg("card.escaped", { name })), short: T(msg("card.escaped.short", { name })) };

  const extras: MorningCard["extras"] = [];
  if (m.wishResult) extras.push({ text: T(wishResultLine(m.wishResult).text), good: !!m.wishResult.kept });
  if (m.treasure) extras.push({ text: T(msg("card.treasure", { item: msg(`item.${m.treasure.item}`), n: m.treasure.growth })), good: true });
  for (const b of m.boosts ?? []) extras.push({ text: T(b), good: true });
  const wish = m.wish ? { label: T(msg(`wish.${m.wish.kind}`)), text: T(m.wish.text), short: T(m.wish.short) } : undefined;

  return { date: m.date, night, highlights, headline: highlights[0]!, gain, from, to, surprise, extras, wish };
}
