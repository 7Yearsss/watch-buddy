import { describe, expect, it } from "vitest";
import { addDays, type DailyHealth } from "@pulseling/engine";
import { createGame, liveDay, migrate, pickWish, startTrial, wishKept, WISH_CHANCE, WISH_GROWTH, type GameState, type Wish } from "../src";

const day = (i: number, over: Partial<DailyHealth> = {}): Omit<DailyHealth, "date"> => ({
  worn: true, steps: 6000 + (i % 5) * 800, standHours: 10, activeEnergyKcal: 420, flightsClimbed: 6,
  sleepMinutes: 420, bedtimeMinutes: -30, deepSleepRatio: 0.16, nightHrvMs: 45, restingHr: 62,
  cardioMinutes: i % 3 === 0 ? 30 : 0, strengthMinutes: i % 4 === 0 ? 30 : 0, ...over,
});
const start = "2026-03-01";
const history = (n: number, over: Partial<DailyHealth> = {}) => Array.from({ length: n }, (_, i) => ({ date: addDays(start, i - n), ...day(i, over) }));
const newGame = (id = "u1") => createGame({ userId: id, starter: "fire", installDate: start, history: history(28) });
const play = (s: GameState, n: number) => {
  for (let i = 0; i < n; i++) {
    if (s.trial === "offered") s = startTrial(s);
    s = liveDay(s, day(i));
  }
  return s;
};

describe("daily wishes", () => {
  it("starts with the onboarding wish and rewards keeping it", () => {
    const s = newGame();
    expect(s.wishes[0]).toMatchObject({ date: start, kind: "wear" });
    const after = liveDay(s, day(0));
    expect(after.morning?.wishResult).toMatchObject({ kind: "wear", kept: true });
    const without = liveDay({ ...s, wishes: [] }, day(0));
    expect(after.pet.totalGrowth - without.pet.totalGrowth).toBe(WISH_GROWTH);
  });

  it("costs nothing when missed", () => {
    const s = newGame();
    const missed = liveDay(s, { worn: false });
    const none = liveDay({ ...s, wishes: [] }, { worn: false });
    expect(missed.morning?.wishResult?.kept).toBe(false);
    expect(missed.pet).toEqual(none.pet);
  });

  it("scales targets to the player's own baseline", () => {
    const low = pickAll(history(14, { steps: 3000 }), "walk");
    const high = pickAll(history(14, { steps: 15000 }), "walk");
    expect(low!.target).toBeLessThan(4500);
    expect(high!.target).toBeGreaterThan(16000);
  });

  it("comes on roughly the intended share of days and never repeats a kind within 3 days", () => {
    const h = history(14);
    let offered = 0;
    const recent: Wish[] = [];
    for (let i = 0; i < 400; i++) {
      const w = pickWish("u9", addDays(start, i), h, recent);
      if (!w) continue;
      offered++;
      expect(recent.slice(0, 3).map((r) => r.kind)).not.toContain(w.kind);
      recent.unshift(w);
    }
    expect(offered / 400).toBeGreaterThan(WISH_CHANCE - 0.08);
    expect(offered / 400).toBeLessThan(WISH_CHANCE + 0.08);
  });

  it("checks each kind against the day's data", () => {
    const d = { date: start, ...day(0, { steps: 9000, bedtimeMinutes: -60, flightsClimbed: 3 }) };
    expect(wishKept({ date: start, kind: "walk", target: 8000, text: "", short: "" }, d)).toBe(true);
    expect(wishKept({ date: start, kind: "early", target: -50, text: "", short: "" }, d)).toBe(true);
    expect(wishKept({ date: start, kind: "stairs", target: 5, text: "", short: "" }, d)).toBe(false);
    expect(wishKept({ date: start, kind: "walk", target: 8000, text: "", short: "" }, { ...d, worn: false })).toBe(false);
  });
});

function pickAll(h: DailyHealth[], kind: Wish["kind"]): Wish | undefined {
  for (let i = 0; i < 200; i++) {
    const w = pickWish("u3", addDays(start, i), h, []);
    if (w?.kind === kind) return w;
  }
  return undefined;
}

describe("random events that change tomorrow", () => {
  it("a guest is met for sure the next morning", () => {
    let s = play(newGame(), 2);
    s = { ...s, tomorrow: { date: addDays(s.today, 1), guest: "coralis" } };
    const next = liveDay(s, day(9));
    expect(next.morning?.encounter).toBe(true);
    expect(next.morning?.trial.opponentName).toBe("coralis");
    expect(next.morning?.boosts.length).toBeGreaterThan(0);
  });

  it("a lucky morning (meteor) meets wild monsters more often", () => {
    let plain = 0;
    let lucky = 0;
    for (let k = 0; k < 60; k++) {
      const s = play(newGame(`luck${k}`), 1);
      const tomorrow = addDays(s.today, 1);
      if (liveDay(s, day(1)).morning?.encounter) plain++;
      if (liveDay({ ...s, tomorrow: { date: tomorrow, luck: "流星雨" } }, day(1)).morning?.encounter) lucky++;
    }
    expect(lucky).toBeGreaterThan(plain);
  });

  it("a treasure map opens three days later into the collection", () => {
    let s = play(newGame(), 1);
    s = { ...s, treasures: [{ opensOn: addDays(s.today, 1) }] };
    const next = liveDay(s, day(5));
    expect(next.morning?.treasure).toBeDefined();
    expect(next.treasures).toEqual([]);
    expect(next.collection[next.morning!.treasure!.item]).toBe(1);
  });

  it("keeps 120 days deterministic and loads old saves", () => {
    const a = play(newGame("det"), 120);
    const b = play(newGame("det"), 120);
    expect(a).toEqual(b);
    expect(a.surprises.some((x) => ["meteor", "guest", "treasure", "weather"].includes(x.kind))).toBe(true);
    const old = newGame() as Partial<GameState>;
    delete old.wishes; delete old.tomorrow; delete old.treasures;
    const m = migrate(old as GameState);
    expect(m.wishes).toEqual([]);
    expect(m.tomorrow).toBeNull();
  });
});
