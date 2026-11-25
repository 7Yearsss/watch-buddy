// The opening's heartbeat, shared by the SVG line (Home.astro) and the particles that settle onto it (site.ts),
// so the dust lands on exactly the line that takes over from it.
// x runs 0 → 1 across the screen; y is in the line's viewBox units (0 → 100, resting at 50).
const g = (x: number, c: number, w: number) => Math.exp(-((x - c) ** 2) / (2 * w * w));
export const BEATS = [0.14, 0.38, 0.62, 0.86];
export const ecg = (x: number, beats: number[], k = 1) =>
  beats.reduce((y, c) => y - 34 * k * g(x, c, 0.0045) + 12 * k * g(x, c + 0.011, 0.005) - 5 * k * g(x, c - 0.03, 0.009) - 7 * k * g(x, c + 0.05, 0.014), 0);
export const heartbeat = (x: number) => 50 + ecg(x, BEATS, 1.2);
/** The line's box is this share of the stage's height (.mainline height), centred on --ly. */
export const LINE_BOX = 0.31;
