import { describe, expect, it } from "vitest";
import { dayPhase, sleepWindow } from "@pulseling/game";
import { absenceNotice, morningNotice, NOTICE_MAX_CHARS } from "@pulseling/game";
import { morningCard } from "@pulseling/game";
import { fightBoss, fightFriend, FRIENDS, friendState, liveDay, newGame, personaDay, startTrial, status, type GameState } from "../src/game";

/** Play n days with a persona's simulated data, accepting the trial and the first met adult form. */
function play(s: GameState, days: number, each?: (s: GameState) => void): GameState {
  for (let i = 0; i < days; i++) {
    if (s.trial === "offered") s = startTrial(s);
    s = liveDay(s, personaDay(s, s.pet.starter, s.today));
    each?.(s);
  }
  return s;
}

describe("day/night", () => {
  const w = { bed: -30, wake: 420 }; // 23:30 → 07:00
  it("handles the window across midnight", () => {
    expect(dayPhase(0, w)).toBe("sleep");
    expect(dayPhase(23 * 60 + 45, w)).toBe("sleep");
    expect(dayPhase(7 * 60 + 30, w)).toBe("morning");
    expect(dayPhase(12 * 60, w)).toBe("day");
    expect(dayPhase(23 * 60, w)).toBe("winddown");
  });
  it("falls back to defaults with no data", () => {
    expect(sleepWindow([])).toEqual({ bed: -30, wake: 420 });
  });
});

describe("notifications", () => {
  const s = play(newGame("fire", "walker", "2026-01-05", "t-notice"), 20);
  const facts = { evolveReady: false, bossToday: false, bossWon: false, lettersUnread: false, daysAway: 0 };
  it("one short, specific morning notice", () => {
    const n = morningNotice(s, facts)!;
    expect(n.text.length).toBeLessThanOrEqual(NOTICE_MAX_CHARS);
    expect(n.text).not.toContain("发现了一件事");
  });
  it("evolution beats everything else", () => {
    expect(morningNotice(s, { ...facts, evolveReady: true, bossToday: true })!.note).toContain("优先级 1");
  });
  it("goes quiet when the player is away, with only two gentle notes", () => {
    expect(morningNotice(s, { ...facts, daysAway: 2 })).toBeNull();
    const sent = [1, 2, 3, 4, 5, 6, 7, 8, 14].filter((d) => absenceNotice({ ...facts, daysAway: d }));
    expect(sent).toEqual([3, 7]);
  });
});

describe("daily surprises and the morning card", () => {
  const seen: { date: string; kind: string; encounter: boolean }[] = [];
  const s = play(newGame("water", "runner", "2026-01-05", "t-surprise"), 60, (x) => {
    if (x.morning) seen.push({ date: x.morning.date, kind: x.morning.surprise?.kind ?? "", encounter: x.morning.encounter });
    const st = status(x);
    const card = morningCard(x, st.progress, st.threshold);
    if (card) {
      expect(card.highlights.length).toBeGreaterThan(0);
      expect(card.highlights.length).toBeLessThanOrEqual(2);
      if (card.highlights[1]) expect(card.highlights[1]).not.toMatch(/\d/);
    }
  });
  it("every morning has either a wild monster or a surprise", () => {
    expect(seen.every((m) => m.encounter || m.kind)).toBe(true);
  });
  it("never the same surprise kind within 3 days", () => {
    const quiet = seen.filter((m) => !m.encounter);
    for (let i = 0; i < quiet.length; i++)
      for (let j = i + 1; j < quiet.length; j++) {
        const gap = (Date.parse(quiet[j]!.date) - Date.parse(quiet[i]!.date)) / 86400000;
        if (gap < 3) expect(quiet[j]!.kind).not.toBe(quiet[i]!.kind);
      }
  });
  it("collects items and learns moves", () => {
    expect(Object.keys(s.collection).length).toBeGreaterThan(0);
    expect(s.moves.length).toBeGreaterThan(0);
  });
});

describe("weekly boss and friends", () => {
  it("an unfought boss resolves the next day, with its letter", () => {
    let s = newGame("grass", "walker", "2026-01-05", "t-boss");
    let sawPending = false;
    s = play(s, 30, (x) => { if (x.bossPending) sawPending = true; });
    expect(sawPending).toBe(true);
    expect(s.bosses.length).toBeGreaterThanOrEqual(3);
    expect(s.letters.length).toBe(s.bosses.length);
  });
  it("fighting the boss by hand clears it", () => {
    let s = newGame("grass", "walker", "2026-01-05", "t-boss2");
    while (!s.bossPending) s = play(s, 1);
    s = fightBoss(s, 1);
    expect(s.bossPending).toBeNull();
    expect(s.boss?.date).toBe(s.today);
  });
  it("simulated friends evolve and battles are repeatable", () => {
    const s = play(newGame("fire", "walker", "2026-01-05", "t-friends"), 90);
    for (const f of FRIENDS.filter((x) => x.persona !== "sedentary")) expect(friendState(s, f).pet.stage).toBe("adult");
    const a = fightFriend(s, FRIENDS[0]!, 0.5).report.result;
    const b = fightFriend(s, FRIENDS[0]!, 0.5).report.result;
    expect(a).toEqual(b);
  });
});
