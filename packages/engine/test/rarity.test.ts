import { describe, expect, it } from "vitest";
import {
  ACTIVE_DAYS_FOR_UPGRADE,
  defaultConfig as cfg,
  evolutionStatus,
  evolve,
  hatch,
  nextEarnedRarity,
  petCombatant,
  processDay,
  RARITIES,
  upgradeRarity,
  type DailyHealth,
  type PetState,
  type Rarity,
} from "../src";
import { lifter, series } from "./helpers";

const hatchWith = (id: string) => hatch({ id, starter: "fire", date: "2026-03-01", history: [] }, cfg).pet;

describe("hatch rarity", () => {
  it("follows roughly 60 / 25 / 10 / 4 / 1", () => {
    const counts = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
    const n = 20000;
    for (let i = 0; i < n; i++) counts[hatchWith(`user-${i}`).rarity]++;
    expect(counts.common / n).toBeCloseTo(0.6, 1);
    expect(counts.uncommon / n).toBeCloseTo(0.25, 1);
    expect(counts.rare / n).toBeCloseTo(0.1, 1);
    expect(counts.epic / n).toBeGreaterThan(0.025);
    expect(counts.epic / n).toBeLessThan(0.055);
    expect(counts.legendary / n).toBeGreaterThan(0.005);
    expect(counts.legendary / n).toBeLessThan(0.016);
  });

  it("adds one visual layer per tier", () => {
    const byRarity = new Map<Rarity, PetState>();
    for (let i = 0; byRarity.size < RARITIES.length && i < 50000; i++) {
      const p = hatchWith(`seek-${i}`);
      if (!byRarity.has(p.rarity)) byRarity.set(p.rarity, p);
    }
    expect(byRarity.get("common")!.cosmetics).toEqual({});
    expect(Object.keys(byRarity.get("uncommon")!.cosmetics)).toEqual(["accessory"]);
    expect(Object.keys(byRarity.get("rare")!.cosmetics)).toEqual(["accessory", "eyes"]);
    expect(Object.keys(byRarity.get("epic")!.cosmetics)).toEqual(["accessory", "eyes", "effect"]);
    expect(Object.keys(byRarity.get("legendary")!.cosmetics)).toEqual(["accessory", "eyes", "effect", "aura"]);
  });

  it("never changes battle stats", () => {
    const common = { ...hatchWith("a"), rarity: "common" as const, cosmetics: {} };
    const legendary = { ...common, rarity: "legendary" as const, cosmetics: { accessory: "tiny-crown", aura: "pulse-aura" } };
    expect(petCombatant(legendary, {}, cfg)).toEqual(petCombatant(common, {}, cfg));
  });

  it("is fixed for an account", () => {
    expect(hatchWith("same")).toEqual(hatchWith("same"));
  });
});

describe("earning rarity", () => {
  const common = (): PetState => ({ ...hatchWith("grow"), hatchRarity: "common", rarity: "common", cosmetics: {}, rarityUpgrades: [] });

  function live(pet: PetState, days: DailyHealth[], fromIndex: number, target?: PetState["target"]) {
    let p: PetState = { ...pet, target };
    for (let i = fromIndex; i < days.length; i++) {
      const day = days[i]!;
      p = processDay(p, day, days.slice(0, i), { active: true }, cfg).pet;
      const status = evolutionStatus(p, days.slice(0, i + 1), day.date, cfg);
      if (status.auto) p = evolve(p, status, status.auto, day.date);
      if (p.stage === "adult") break;
    }
    return p;
  }

  it("lets a common pet become rare by keeping a habit through both evolutions", () => {
    const days = series(28 + 120, lifter);
    const pet = { ...common(), hatchedOn: days[28]!.date, stageStartedOn: days[28]!.date };
    const adult = live(pet, days, 28, "fighting");
    expect(adult.stage).toBe("adult");
    expect(adult.rarity).toBe("rare");
    expect(adult.hatchRarity).toBe("common");
    expect(adult.rarityUpgrades).toEqual(["juvenile", "adult"]);
    expect(Object.keys(adult.cosmetics)).toEqual(["accessory", "eyes"]);
  });

  it("does not upgrade without a real habit or when falling back to pure", () => {
    const days = series(28 + 30, (i) => ({ sleepMinutes: 360, bedtimeMinutes: (i % 3) * 90 - 60 }));
    const pet = { ...common(), hatchedOn: days[28]!.date, stageStartedOn: days[28]!.date };
    let p = pet;
    for (let i = 28; i < days.length && p.stage === "baby"; i++) {
      p = processDay(p, days[i]!, days.slice(0, i), { active: true }, cfg).pet;
      const s = evolutionStatus(p, days.slice(0, i + 1), days[i]!.date, cfg);
      if (s.auto) p = evolve(p, s, s.auto, days[i]!.date);
    }
    expect(p.stage).toBe("juvenile");
    expect(p.rarity).toBe("common");

    const juvenile: PetState = { ...p, progress: cfg.evolution.adult.threshold, stageStartedOn: "2025-01-01" };
    const status = evolutionStatus(juvenile, days, days[days.length - 1]!.date, cfg);
    expect(evolve(juvenile, status, "pure", days[days.length - 1]!.date).rarity).toBe("common");
  });

  it("counts total active days, not a streak, and upgrades once at 100", () => {
    const days = series(28 + 105, (i) => (i % 9 === 0 ? { worn: false } : {}));
    let p: PetState = { ...common(), hatchedOn: days[28]!.date, stageStartedOn: days[28]!.date, stage: "adult" };
    for (let i = 28; i < days.length; i++) p = processDay(p, days[i]!, days.slice(0, i), { active: true }, cfg).pet;
    expect(p.activeDays).toBeGreaterThanOrEqual(ACTIVE_DAYS_FOR_UPGRADE - 15);
    const filled = { ...p, activeDays: ACTIVE_DAYS_FOR_UPGRADE - 1 };
    const after = processDay(filled, { ...days[days.length - 1]!, date: "2027-01-01", worn: true }, days, { active: true }, cfg).pet;
    expect(after.rarity).toBe("uncommon");
    expect(upgradeRarity(after, "activeDays").rarity).toBe("uncommon");
  });

  it("caps earned rarity at epic; legendary stays hatch-only", () => {
    const epic: PetState = { ...common(), rarity: "epic", hatchRarity: "rare", cosmetics: { accessory: "bow", eyes: "star", effect: "sparks" } };
    expect(upgradeRarity(epic, "adult").rarity).toBe("epic");
    expect(nextEarnedRarity("rare")).toBe("epic");
    expect(nextEarnedRarity("epic")).toBeNull();
  });
});
