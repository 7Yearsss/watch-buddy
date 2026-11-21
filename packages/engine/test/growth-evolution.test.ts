import { describe, expect, it } from "vitest";
import {
  addDays,
  conditionMultiplier,
  dayGrowth,
  defaultConfig as cfg,
  evolutionStatus,
  evolve,
  hatch,
  lifestyleAffinity,
  processDay,
  type DailyHealth,
  type PetState,
} from "../src";
import { lifter, runner, series, START } from "./helpers";

function simulate(days: DailyHealth[], fromIndex: number, pet: PetState, stopWhen?: (p: PetState, day: string) => boolean) {
  let p = pet;
  for (let i = fromIndex; i < days.length; i++) {
    const day = days[i]!;
    p = processDay(p, day, days.slice(0, i), { active: true }, cfg).pet;
    const status = evolutionStatus(p, days.slice(0, i + 1), day.date, cfg);
    if (status.auto) p = evolve(p, status, status.auto, day.date);
    if (stopWhen?.(p, day.date)) return { pet: p, day: day.date };
  }
  return { pet: p, day: days[days.length - 1]!.date };
}

describe("growth", () => {
  it("earns the base plus an ordinary night for having data, and at most double", () => {
    const ordinary = cfg.growth.base + (cfg.growth.bonus * cfg.growth.ordinaryNightEcho) / cfg.growth.topEchoes;
    expect(dayGrowth({}, cfg).gain).toBeCloseTo(ordinary);
    expect(dayGrowth({ grass: 1, flying: 0.5 }, cfg).gain).toBeCloseTo(cfg.growth.base + (cfg.growth.bonus * 2) / 3);
    expect(dayGrowth({ grass: 1, flying: 1, water: 1, fire: 0.2 }, cfg).gain).toBe(20);
  });

  it("treats a night without sleep data as an ordinary night, and wearing the watch to bed never hurts", () => {
    const day = { grass: 0.4, flying: 0.6 };
    const offAtNight = dayGrowth(day, cfg);
    const poorNight = dayGrowth({ ...day, water: -1 }, cfg);
    const goodNight = dayGrowth({ ...day, water: 1 }, cfg);
    expect(poorNight.gain).toBeCloseTo(offAtNight.gain);
    expect(poorNight.quality).toBeCloseTo(offAtNight.quality);
    expect(poorNight.statGains.recovery).toBeCloseTo(offAtNight.statGains.recovery);
    expect(goodNight.gain).toBeGreaterThan(offAtNight.gain);
    expect(goodNight.quality).toBeGreaterThan(offAtNight.quality);
  });

  it("never drops condition below 1", () => {
    expect(conditionMultiplier([], cfg)).toBe(1);
    expect(conditionMultiplier([0, 0, 0], cfg)).toBe(1);
    expect(conditionMultiplier([1, 1, 1], cfg)).toBeCloseTo(1 + cfg.condition.max);
  });

  it("gives nothing on unworn days or while hibernating", () => {
    const history = series(30);
    const { pet } = hatch({ id: "p", starter: "fire", date: addDays(START, 28), history }, cfg);
    const today = history[28]!;
    expect(processDay(pet, { ...today, worn: false }, history.slice(0, 28), { active: true }, cfg).result.gain).toBe(0);
    expect(processDay(pet, today, history.slice(0, 28), { active: false }, cfg).result.gain).toBe(0);
  });
});

describe("hatch", () => {
  it("is deterministic for the same seed and reports the history", () => {
    const history = series(28, runner);
    const a = hatch({ id: "abc", starter: "water", date: addDays(START, 28), history }, cfg);
    const b = hatch({ id: "abc", starter: "water", date: addDays(START, 28), history }, cfg);
    expect(a.pet).toEqual(b.pet);
    expect(a.facts.historyDays).toBe(28);
    expect(a.facts.weeklyCardioMinutes).toBeCloseTo(135);
  });

  it("works with no history", () => {
    const { facts } = hatch({ id: "new", starter: "grass", date: START, history: [] }, cfg);
    expect(facts.historyDays).toBe(0);
    expect(facts.topLifestyle).toBeNull();
  });
});

describe("lifestyle affinity", () => {
  it("recognises a habitual runner and lifter against absolute guidelines", () => {
    expect(lifestyleAffinity(series(21, runner), cfg).flying).toBeGreaterThan(0.6);
    expect(lifestyleAffinity(series(21, lifter), cfg).fighting).toBeGreaterThan(0.6);
    expect(lifestyleAffinity(series(21), cfg).fighting).toBe(0);
  });
});

describe("evolution", () => {
  it("takes about two weeks for a typical user and never fewer than 10 days", () => {
    const days = series(28 + 40);
    const { pet } = hatch({ id: "t", starter: "fire", date: addDays(START, 28), history: days.slice(0, 28) }, cfg);
    const res = simulate(days, 28, pet, (p) => p.stage === "juvenile");
    const took = (Date.parse(res.day) - Date.parse(addDays(START, 28))) / 86_400_000;
    expect(res.pet.stage).toBe("juvenile");
    expect(took).toBeGreaterThanOrEqual(cfg.evolution.juvenile.minDays);
    expect(took).toBeLessThanOrEqual(20);
  });

  it("charges until the target is met, and pure is always a fallback", () => {
    const days = series(28 + 120, runner);
    const { pet } = hatch({ id: "r", starter: "water", date: addDays(START, 28), history: days.slice(0, 28) }, cfg);
    const juvenile = simulate(days, 28, pet, (p) => p.stage === "juvenile");
    const wantsFighting = { ...juvenile.pet, target: "fighting" as const };
    const startIndex = days.findIndex((d) => d.date === juvenile.day) + 1;
    const after = simulate(days, startIndex, wantsFighting);
    expect(after.pet.stage).toBe("juvenile");

    const status = evolutionStatus(after.pet, days, after.day, cfg);
    expect(status.ready).toBe(true);
    expect(status.options.find((o) => o.variant === "fighting")?.met).toBe(false);
    expect(status.options.find((o) => o.variant === "flying")?.met).toBe(true);
    expect(() => evolve(after.pet, status, "fighting", after.day)).toThrow();
    expect(evolve(after.pet, status, "pure", after.day).adultVariant).toBe("pure");
  });

  it("evolves into the target automatically once its lifestyle condition holds", () => {
    const days = series(28 + 120, lifter);
    const { pet } = hatch({ id: "l", starter: "grass", date: addDays(START, 28), history: days.slice(0, 28) }, cfg);
    const res = simulate(days, 28, { ...pet, target: "fighting" }, (p) => p.stage === "adult");
    expect(res.pet.stage).toBe("adult");
    expect(res.pet.adultVariant).toBe("fighting");
  });

  it("reports what is missing for the dragon form", () => {
    const days = series(28 + 14, runner);
    const juvenile: PetState = { ...hatch({ id: "d", starter: "fire", date: addDays(START, 28), history: [] }, cfg).pet, stage: "juvenile" };
    const status = evolutionStatus(juvenile, days, days[days.length - 1]!.date, cfg);
    const dragon = status.options.find((o) => o.variant === "dragon")!;
    expect(dragon.met).toBe(false);
    expect(dragon.gaps[0]?.kind).toBe("dragon");
  });
});
