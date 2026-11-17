import { describe, expect, it } from "vitest";
import {
  addDays,
  bedtimeScore,
  computeBaseline,
  defaultConfig as cfg,
  echoesFromScores,
  sanitize,
  scoreMetrics,
  sleepScore,
} from "../src";
import { runner, series, START, typicalDay } from "./helpers";

describe("baseline", () => {
  it("uses the median of the last 28 worn days", () => {
    const history = series(40, (i) => ({ steps: i < 12 ? 20000 : 7000 }));
    const b = computeBaseline(history, addDays(START, 40), cfg);
    expect(b.daily.steps).toBe(7000);
    expect(b.sampleDays).toBe(28);
  });

  it("blends with population defaults when there are fewer than 7 days", () => {
    const history = series(2, () => ({ steps: 13000 }));
    const b = computeBaseline(history, addDays(START, 2), cfg);
    expect(b.daily.steps).toBeCloseTo((2 * 13000 + 5 * 6000) / 7);
  });

  it("falls back to defaults with no history and respects floors", () => {
    const empty = computeBaseline([], START, cfg);
    expect(empty.daily.steps).toBe(6000);
    const lazy = computeBaseline(series(28, () => ({ steps: 500 })), addDays(START, 28), cfg);
    expect(lazy.daily.steps).toBe(2000);
  });

  it("ignores unworn days", () => {
    const history = series(28, (i) => (i % 2 ? { worn: false, steps: 0 } : { steps: 8000 }));
    const b = computeBaseline(history, addDays(START, 28), cfg);
    expect(b.daily.steps).toBe(8000);
    expect(b.sampleDays).toBe(14);
  });

  it("computes weekly totals for sparse workouts from worn days", () => {
    const history = series(28, runner);
    const b = computeBaseline(history, addDays(START, 28), cfg);
    expect(b.weekly.cardioMinutes).toBeCloseTo(135);
  });
});

describe("scores", () => {
  it("caps implausible values", () => {
    expect(sanitize({ ...typicalDay, date: START, steps: 500000 }, cfg).steps).toBe(60000);
  });

  it("scores sleep against an absolute 7–9 hour band", () => {
    expect(sleepScore(480, cfg)).toBe(1);
    expect(sleepScore(360, cfg)).toBe(0.5);
    expect(sleepScore(300, cfg)).toBe(0);
    expect(sleepScore(600, cfg)).toBe(0.5);
    expect(sleepScore(720, cfg)).toBe(-0.5);
  });

  it("rewards a regular bedtime", () => {
    expect(bedtimeScore(-20, -30, cfg)).toBe(1);
    expect(bedtimeScore(90, -30, cfg)).toBe(-1);
  });

  it("gives full grass echo at +50% steps and zero at the usual level", () => {
    const history = series(28);
    const baseline = computeBaseline(history, addDays(START, 28), cfg);
    const usual = { ...typicalDay, date: addDays(START, 28) };
    const more = { ...usual, steps: 9000, standHours: 13.5 };
    expect(echoesFromScores(scoreMetrics(usual, history, baseline, cfg), cfg).grass).toBeCloseTo(0);
    expect(echoesFromScores(scoreMetrics(more, history, baseline, cfg), cfg).grass).toBeCloseTo(1);
  });

  it("does not punish rest days between regular runs", () => {
    const history = series(35, runner);
    const baseline = computeBaseline(history.slice(0, 28), addDays(START, 28), cfg);
    const restDay = history[29]!;
    expect(runner(29)).toEqual({});
    const flying = echoesFromScores(scoreMetrics(restDay, history.slice(0, 29), baseline, cfg), cfg).flying!;
    expect(Math.abs(flying)).toBeLessThan(0.25);
  });

  it("treats lower resting heart rate as better", () => {
    const history = series(28);
    const baseline = computeBaseline(history, addDays(START, 28), cfg);
    const day = { ...typicalDay, date: addDays(START, 28), restingHr: 60 };
    expect(scoreMetrics(day, history, baseline, cfg).restingHr).toBeGreaterThan(0.5);
  });
});
