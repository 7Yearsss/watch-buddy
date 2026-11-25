/**
 * One believable day of Apple Watch data, drawn the way the Health app draws it: steps as hourly bars,
 * sleep as stages, heart rate as a line with the workout picked out, HRV as overnight readings against
 * your usual range. Every number adds up to what the page says (8,412 steps, 7 hr 20 min asleep,
 * a 40-minute run at 19:05, HRV above usual). Illustrative, not anyone's real data.
 * x is always a fraction of the day (0 = 00:00, 1 = 24:00).
 */

/** Steps per hour, 00:00–23:00. Sums to 8,412; the 19:00 hour is the run. */
export const STEPS = [0, 0, 0, 0, 0, 0, 0, 120, 520, 160, 90, 140, 880, 260, 80, 120, 110, 160, 690, 4720, 210, 90, 62, 0];

/** Sleep stages as Apple Watch reports them. Level 0 = Awake (top) … 3 = Deep (bottom). */
export const STAGES = ["awake", "rem", "core", "deep"] as const;
type Stage = (typeof STAGES)[number];
const night = (start: number, parts: [Stage, number][]) => {
  let m = start;
  return parts.map(([stage, min]) => { const seg = { stage, level: STAGES.indexOf(stage), x: m / 1440, w: min / 1440 }; m += min; return seg; });
};
/** Asleep since 23:40 the night before (00:00 is mid-cycle) until 07:12, then in bed again at 23:40.
 *  Asleep 00:00–07:12 = 432 min, 12 of them awake, plus the 20 min before midnight = 7 hr 20 min. */
export const SLEEP = [
  ...night(0, [["core", 25], ["deep", 50], ["core", 40], ["rem", 20], ["core", 35], ["deep", 35], ["core", 30], ["awake", 4],
    ["rem", 30], ["core", 45], ["deep", 15], ["core", 30], ["rem", 35], ["awake", 8], ["core", 20], ["rem", 10]]),
  ...night(23 * 60 + 40, [["awake", 6], ["core", 14]]),
];

// heart rate, bpm, every 2 minutes
const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hill = (x: number, c: number, w: number) => Math.exp(-((x - c) ** 2) / (2 * w * w));
const bump = (x: number, a: number, b: number, edge = 6) => sm(a - edge, a, x) * (1 - sm(b, b + edge, x));
function bpm(m: number) {
  const asleep = 1 - sm(430, 440, m) + sm(1418, 1426, m);
  const wobble = 3 * Math.sin(m / 23) + 2 * Math.sin(m / 7.3) + 1.5 * Math.sin(m / 3.1);
  let v = asleep * (53 + 0.6 * wobble) + (1 - asleep) * (68 + wobble);
  // walks: a soft rise and fall, never flat
  v += 24 * hill(m, 12 * 60 + 42, 11) + 28 * hill(m, 18 * 60 + 31, 10);
  // the run: a quick climb, drifting up as it goes (cardiac drift), a few surges, then a slower recovery
  const r = bump(m, 19 * 60 + 9, 19 * 60 + 44, 5);
  v += r * (74 + 16 * sm(19 * 60 + 9, 19 * 60 + 44, m) + 5 * Math.sin(m / 3.7) + 3 * Math.sin(m / 1.7));
  v += 30 * sm(19 * 60 + 44, 19 * 60 + 47, m) * (1 - sm(19 * 60 + 47, 20 * 60 + 5, m));
  return v;
}
const HR_MIN = 40, HR_MAX = 180;
const y = (v: number) => (6 + (1 - (v - HR_MIN) / (HR_MAX - HR_MIN)) * 90).toFixed(1);
const pts = Array.from({ length: 721 }, (_, i) => i * 2).map((m) => ({ m, x: ((m / 1440) * 1000).toFixed(1), y: y(bpm(m)) }));
/** The whole day's heart rate (viewBox 0 0 1000 100). */
export const HR_LINE = pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join("");
const run = pts.filter((p) => p.m >= 19 * 60 + 4 && p.m <= 19 * 60 + 52);
/** The run, stroked on top and filled down to the baseline. */
export const HR_RUN = run.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join("");
export const HR_RUN_AREA = `${HR_RUN}L${run.at(-1)!.x} 100L${run[0]!.x} 100Z`;

/** HRV readings (ms): mostly overnight, a few by day. Usual range 36–50 ms. */
export const HRV_USUAL = { lo: 36, hi: 50 };
export const HRV = [[0.6, 54], [1.4, 61], [2.3, 58], [3.1, 66], [3.9, 57], [4.8, 63], [5.6, 60], [6.5, 55], [9.5, 44], [14.2, 41], [17, 46], [21.5, 49]]
  .map(([h, ms]) => ({ x: h! / 24, ms: ms! }));
/** HRV value → top % inside the lane (25 ms at the bottom, 75 ms at the top). */
export const hrvTop = (ms: number) => (75 - ms) / 50 * 100;

/** Where each row's notes point, as a fraction of the day (same order as the dictionaries' tags). */
export const TAG_AT = [[12.5 / 24, 18.5 / 24], [7.2 / 24, 23.67 / 24], [19.4 / 24], [3.1 / 24]];
