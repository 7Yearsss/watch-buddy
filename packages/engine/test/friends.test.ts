import { describe, expect, it } from "vitest";
import { defaultConfig as cfg, friendSnapshot, hatch, runFriendBattle } from "../src";

const pet = (id: string, starter: "fire" | "water" | "grass") => hatch({ id, starter, date: "2026-03-01", history: [] }, cfg).pet;

describe("friend battles", () => {
  const me = pet("me", "fire");
  const friend = friendSnapshot("f1", "2026-03-05", pet("friend", "grass"), {}, cfg);

  it("is deterministic for the same day and friend", () => {
    const a = runFriendBattle(me, { userId: "me", date: "2026-03-05" }, friend, cfg);
    const b = runFriendBattle(me, { userId: "me", date: "2026-03-05" }, friend, cfg);
    expect(a).toEqual(b);
  });

  it("a perfect charge only adds a little damage, never less", () => {
    const base = runFriendBattle(me, { userId: "me", date: "2026-03-05", charge: 0 }, friend, cfg);
    const full = runFriendBattle(me, { userId: "me", date: "2026-03-05", charge: 1 }, friend, cfg);
    const neg = runFriendBattle(me, { userId: "me", date: "2026-03-05", charge: -5 }, friend, cfg);
    expect(neg).toEqual(base);
    const firstHit = (r: typeof base) => r.log.find((e) => e.actor === "a" && (e.damage ?? 0) > 0)?.damage ?? 0;
    expect(firstHit(full)).toBeGreaterThanOrEqual(firstHit(base));
    expect(firstHit(full)).toBeLessThanOrEqual(Math.ceil(firstHit(base) * 1.07) + 1);
  });
});

describe("friend leveling", () => {
  it("keeps only part of the power gap, and keeps who is stronger", async () => {
    const { levelPair, FRIEND_GAP_KEPT } = await import("../src");
    const mk = (k: number) => ({ name: "x", types: ["fire" as const], stats: { hp: 100 * k, recovery: 100 * k, attack: 100 * k, speed: 100 * k, defense: 100 * k }, skills: [], tactic: "balanced" as const });
    const [a, b] = levelPair(mk(2), mk(1));
    const ratio = a.stats.attack / b.stats.attack;
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeCloseTo(Math.pow(2, FRIEND_GAP_KEPT), 5);
  });
});
