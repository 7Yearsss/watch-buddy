import { describe, expect, it } from "vitest";
import { addDays, type DailyHealth } from "@pulseling/engine";
import { createGame, fightFriend, liveDay, migrate, snapshotOf, startTrial, type GameState } from "../src";

const day = (i: number): Omit<DailyHealth, "date"> => ({
  worn: true, steps: 6000 + (i % 5) * 800, standHours: 10, activeEnergyKcal: 420, flightsClimbed: 6,
  sleepMinutes: 420, bedtimeMinutes: -30, deepSleepRatio: 0.16, nightHrvMs: 45, restingHr: 62,
  cardioMinutes: i % 3 === 0 ? 30 : 0, strengthMinutes: i % 4 === 0 ? 30 : 0,
});
const start = "2026-03-01";
const history = (n: number) => Array.from({ length: n }, (_, i) => ({ date: addDays(start, i - n), ...day(i) }));
const play = (s: GameState, n: number) => {
  for (let i = 0; i < n; i++) {
    if (s.trial === "offered") s = startTrial(s);
    s = liveDay(s, day(i));
  }
  return s;
};

describe("@pulseling/game (server path: real history, no personas, no storage)", () => {
  it("hatches from uploaded history and is deterministic", () => {
    const a = play(createGame({ userId: "u1", starter: "fire", installDate: start, history: history(28) }), 20);
    const b = play(createGame({ userId: "u1", starter: "fire", installDate: start, history: history(28) }), 20);
    expect(a.pet).toEqual(b.pet);
    expect(a.results.length).toBe(20);
  });
  it("fights a friend's saved snapshot", () => {
    const me = play(createGame({ userId: "me", starter: "water", installDate: start, history: history(28) }), 30);
    const them = play(createGame({ userId: "them", starter: "grass", installDate: start, history: history(28) }), 30);
    const snap = JSON.parse(JSON.stringify(snapshotOf(them))); // as stored in a database
    const r1 = fightFriend(me, { id: "them", name: "TA" }, snap, 0.5);
    const r2 = fightFriend(me, { id: "them", name: "TA" }, snap, 0.5);
    expect(r1.report.result).toEqual(r2.report.result);
    expect(r1.state.friendBattles[0]?.friendId).toBe("them");
  });
  it("migrates old saves", () => {
    const s = createGame({ userId: "u2", starter: "grass", installDate: start, history: history(28) }) as Partial<GameState>;
    delete s.bossPending; delete s.moves;
    const m = migrate(s as GameState);
    expect(m.bossPending).toBeNull();
    expect(m.moves).toEqual([]);
  });
});
