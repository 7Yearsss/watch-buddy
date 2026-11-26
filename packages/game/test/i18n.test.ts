import { describe, expect, it } from "vitest";
import { addDays, type DailyHealth, type Personality } from "@pulseling/engine";
import {
  CATALOGS,
  chat,
  createGame,
  fightBoss,
  hatchLine,
  liveDay,
  migrate,
  morningCard,
  msg,
  pickLocale,
  status,
  t,
  withConfig,
  BUILTIN_CONFIG,
  type GameState,
  type Locale,
  type Msg,
} from "../src";

const start = "2026-03-01";
// Varied days so most kinds of text show up: workouts, short nights, unworn days, stairs.
const day = (i: number): Omit<DailyHealth, "date"> =>
  i % 9 === 4
    ? { worn: false }
    : {
        worn: true, steps: 4000 + ((i * 1337) % 9000), standHours: 10, activeEnergyKcal: 300 + ((i * 71) % 500), flightsClimbed: (i * 7) % 15,
        sleepMinutes: i % 6 === 0 ? undefined : 330 + ((i * 53) % 180), bedtimeMinutes: -60 + ((i * 17) % 90), deepSleepRatio: 0.16, nightHrvMs: 45, restingHr: 62,
        cardioMinutes: i % 3 === 0 ? 30 + (i % 20) : 0, strengthMinutes: i % 4 === 0 ? 30 : 0, highIntensityMinutes: i % 5 === 0 ? 20 : 0,
      };
const history = Array.from({ length: 28 }, (_, i) => ({ date: addDays(start, i - 28), ...day(i) }));

function longGame(userId: string): GameState {
  let s = createGame({ userId, starter: "water", installDate: start, history });
  for (let i = 0; i < 120; i++) {
    s = liveDay(s, day(i));
    if (s.bossPending) s = fightBoss(s, 0.6);
    if (i % 2 === 0) s = chat(s, (["pet", "cheer", "sleep-early", "move", "tired"] as const)[i % 5]!);
  }
  return s;
}

/** Every stored message in a save. */
function messages(x: unknown, out: Msg[] = []): Msg[] {
  if (Array.isArray(x)) x.forEach((v) => messages(v, out));
  else if (x && typeof x === "object") {
    if (typeof (x as Msg).k === "string") out.push(x as Msg);
    for (const v of Object.values(x)) messages(v, out);
  }
  return out;
}

const params = (tpl: string) => [...tpl.matchAll(/\{(\w+)(?:\|[^}]*)?\}/g)].map((m) => m[1]).sort();

describe("game copy", () => {
  // A translation may leave a param out (English "did"/"do" vs Chinese using both), but never use one the code doesn't pass.
  it("has the same keys in every language, and no params the code doesn't pass", () => {
    const zhKeys = Object.keys(CATALOGS.zh).sort();
    for (const locale of Object.keys(CATALOGS) as Locale[]) {
      expect(Object.keys(CATALOGS[locale]).sort(), locale).toEqual(zhKeys);
      for (const k of zhKeys) for (const p of params(CATALOGS[locale][k]!)) expect(params(CATALOGS.zh[k]!), `${locale} ${k} {${p}}`).toContain(p);
    }
  });

  it("renders everything a long game stores, in both languages, with no gaps", () => {
    for (const id of ["a", "b", "c"]) {
      const s = longGame(id);
      const all = messages(s);
      expect(all.length).toBeGreaterThan(100);
      for (const m of all) {
        if (!m.k.startsWith("$")) expect(CATALOGS.zh[m.k], m.k).toBeDefined();
        for (const locale of ["zh", "en"] as Locale[]) {
          const text = t(m, locale);
          expect(text, `${m.k} ${locale}`).not.toMatch(/\{\w+|undefined|NaN|\[object/);
        }
      }
      const st = status(s);
      for (const locale of ["zh", "en"] as Locale[]) {
        const card = JSON.stringify(morningCard(s, st.progress, st.threshold, locale));
        expect(card).not.toMatch(/\{\w+|undefined|NaN|card\.|surprise\./);
      }
      // English text really is English: no Chinese characters left in what the save says.
      const en = all.map((m) => t(m, "en")).join("\n");
      expect(en).not.toMatch(/[一-鿿]/);
    }
  });

  it("a save stores keys, so the same save reads in either language", () => {
    const s = longGame("d");
    const letter = s.letters[0]!.text;
    expect(t(letter, "zh")).toContain("Boss");
    expect(t(letter, "en")).toMatch(/boss/i);
    expect(t(letter, "zh")).not.toEqual(t(letter, "en"));
    expect(JSON.stringify(s.feed)).not.toMatch(/[一-鿿]/);
  });

  it("formats params: numbers, plurals, lists and empty params", () => {
    expect(t(msg("letter.week", { steps: 12300, workouts: 1 }), "en")).toBe("This week you walked 12,300 steps a day and worked out once.");
    expect(t(msg("letter.week", { steps: 12300, workouts: 3 }), "en")).toContain("worked out 3 times");
    expect(t(msg("letter.growth.captures", { g: 40, list: [msg("species.sprout"), msg("species.spark")] }), "zh")).toBe("我一共长了 40 点成长值，还收服了 芽芽、火星。");
    expect(t(msg("letter.won", { type: msg("type.fire"), why: "" }), "en")).toBe("The Fire boss this weekend… I won!");
    for (const p of ["genki", "tsundere", "gentle", "chuuni", "chill"] as Personality[])
      expect(t(hatchLine(p, { historyDays: 28, avgSteps: 8123, weeklyCardioMinutes: 10 } as never), "en")).toContain("8,100 steps");
  });

  it("remote copy overrides a line without an app release", () => {
    const config = { ...BUILTIN_CONFIG, version: "copy-1", copy: { en: { "feed.hatched": "It hatched!" } } };
    expect(withConfig(config, () => t(msg("feed.hatched"), "en"))).toBe("It hatched!");
    expect(withConfig(config, () => t(msg("feed.hatched"), "zh"))).toBe("孵化了！");
    expect(t(msg("feed.hatched"), "en")).toBe("Hatched!");
  });

  it("picks the language from Accept-Language", () => {
    expect(pickLocale("en-US,en;q=0.9,zh;q=0.8")).toBe("en");
    expect(pickLocale("zh-Hans-CN,zh;q=0.9")).toBe("zh");
    expect(pickLocale("fr-FR,en;q=0.5")).toBe("en");
    expect(pickLocale("ja-JP")).toBe("zh");
    expect(pickLocale(undefined)).toBe("zh");
  });

  it("loads saves written before copy keys", () => {
    const s = longGame("e");
    const old = JSON.parse(JSON.stringify(s));
    old.feed = [{ date: start, text: "孵化了！", kind: "info" }];
    old.pendingLine = "你说到做到了！";
    old.collection = { 四叶草: 2, 金色橡果: 1 };
    old.surprises = [{ date: start, kind: "item", item: "露珠", text: "散步的时候捡到了「露珠」", short: "捡到露珠！" }];
    old.tomorrow = { date: start, luck: "流星雨" };
    const m = migrate(old);
    expect(t(m.feed[0]!.text)).toBe("孵化了！");
    expect(t(m.pendingLine)).toBe("你说到做到了！");
    expect(m.collection).toEqual({ clover: 2, "golden-acorn": 1 });
    expect(m.surprises[0]!.item).toBe("dewdrop");
    expect(m.tomorrow?.luck).toBe("meteor");
  });
});
