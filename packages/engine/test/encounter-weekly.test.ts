import { describe, expect, it } from "vitest";
import {
  addDays,
  bossTypeForWeek,
  defaultConfig as cfg,
  ECHO_TYPES,
  isBossDay,
  lifestyleAffinity,
  rollEncounter,
  weekStart,
  weeklyEnergy,
  weeklyEnergyFraction,
  type Affinity,
  type EncounterInput,
} from "../src";
import { runner, series } from "./helpers";

const flat = Object.fromEntries(ECHO_TYPES.map((t) => [t, 0.5])) as Affinity;
const input = (over: Partial<EncounterInput> = {}): EncounterInput => ({
  userId: "u",
  date: "2026-03-01",
  daysSinceLastEncounter: 0,
  affinity: flat,
  echoes: {},
  weeklyEnergyFraction: 0,
  dragonEligible: false,
  ...over,
});

describe("encounters", () => {
  it("happens about 30% of days", () => {
    let hits = 0;
    for (let i = 0; i < 3000; i++) if (rollEncounter(input({ userId: `u${i}` }), cfg)) hits++;
    expect(hits / 3000).toBeGreaterThan(0.26);
    expect(hits / 3000).toBeLessThan(0.34);
  });

  it("is guaranteed after 4 empty days and deterministic", () => {
    for (let i = 0; i < 50; i++) expect(rollEncounter(input({ userId: `p${i}`, daysSinceLastEncounter: 4 }), cfg)).not.toBeNull();
    expect(rollEncounter(input({ daysSinceLastEncounter: 4 }), cfg)).toEqual(rollEncounter(input({ daysSinceLastEncounter: 4 }), cfg));
  });

  it("keeps dragons out unless eligible", () => {
    for (let i = 0; i < 500; i++)
      expect(rollEncounter(input({ userId: `d${i}`, daysSinceLastEncounter: 4 }), cfg)?.species.type).not.toBe("dragon");
  });

  it("leans towards the player's lifestyle", () => {
    const runnerAff = lifestyleAffinity(series(7, runner), cfg);
    let flying = 0;
    let fighting = 0;
    for (let i = 0; i < 2000; i++) {
      const t = rollEncounter(input({ userId: `r${i}`, daysSinceLastEncounter: 4, affinity: runnerAff }), cfg)?.species.type;
      if (t === "flying") flying++;
      if (t === "fighting") fighting++;
    }
    expect(flying).toBeGreaterThan(fighting);
  });

  it("follows roughly 70/25/5 rarity and gets rarer finds with a full week", () => {
    const count = (fraction: number) => {
      const c = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
      for (let i = 0; i < 4000; i++) {
        const e = rollEncounter(input({ userId: `x${i}`, daysSinceLastEncounter: 4, weeklyEnergyFraction: fraction }), cfg);
        if (e) c[e.species.rarity]++;
      }
      return c;
    };
    const empty = count(0);
    expect(empty.common / 4000).toBeGreaterThan(0.64);
    expect(empty.epic / 4000).toBeLessThan(0.08);
    expect(count(1).epic).toBeGreaterThan(empty.epic);
  });
});

describe("weekly cycle", () => {
  it("starts weeks on Monday", () => {
    expect(weekStart("2026-03-04")).toBe("2026-03-02");
    expect(weekStart("2026-03-02")).toBe("2026-03-02");
    expect(weekStart("2026-03-08")).toBe("2026-03-02");
  });

  it("sums this week's growth only", () => {
    const results = series(10, () => ({}), { worn: true }, "2026-02-27").map((d) => ({ date: d.date, gain: 15 }));
    expect(weeklyEnergy(results, "2026-03-04")).toBe(45);
    expect(weeklyEnergyFraction(140, cfg)).toBe(1);
  });

  it("puts the first boss on day 6, then Sundays at least 4 days later", () => {
    const hatched = "2026-03-04";
    expect(isBossDay(addDays(hatched, 6), hatched)).toBe(true);
    expect(isBossDay("2026-03-08", hatched)).toBe(false);
    expect(isBossDay("2026-03-15", hatched)).toBe(true);
    const saturdayHatch = "2026-03-01";
    expect(isBossDay("2026-03-07", saturdayHatch)).toBe(true);
    expect(isBossDay("2026-03-08", saturdayHatch)).toBe(false);
    expect(isBossDay("2026-03-15", saturdayHatch)).toBe(true);
  });

  it("fixes the boss type for the whole week", () => {
    expect(bossTypeForWeek("u", "2026-03-02")).toBe(bossTypeForWeek("u", "2026-03-08"));
  });
});
