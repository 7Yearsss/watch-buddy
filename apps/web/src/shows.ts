import { RARITIES, type Rarity } from "@pulseling/engine";
import { drawSprite, GRID, type SpriteSpec } from "./sprites";

/**
 * Big-event choreography (07 §3): hatch, evolve, capture, rarity-up. Each ≤ 6 s, ends on a result card.
 * The first time a kind plays it can't be skipped; after that a tap jumps to the result.
 * Plays in its own overlay outside #app so app re-renders don't interrupt it.
 */
type Spec = Omit<SpriteSpec, "frame">;
interface Result { title: string; lines: string[] }
export type Show =
  | ({ kind: "hatch"; egg: Spec; pet: Spec } & Result)
  | ({ kind: "evolve"; from: Spec; to: Spec } & Result)
  | ({ kind: "capture"; wild: Spec } & Result)
  | ({ kind: "rarity"; pet: Spec; from: Rarity; to: Rarity } & Result);

const DURATION: Record<Show["kind"], number> = { hatch: 6000, evolve: 5000, capture: 3000, rarity: 3000 };
const RESULT_AT: Record<Show["kind"], number> = { hatch: 4800, evolve: 4500, capture: 2400, rarity: 2700 };
const SEEN_KEY = "pulseling-shows-seen";
const SCALE = 5;

const queue: Show[] = [];
let reduced = false;
/** Reduce Motion: no wobble, flash or flying orb; cross-fade straight to the final pose and result card. */
export const setReducedMotion = (on: boolean) => { reduced = on; };
let playing = false;

export function queueShow(show: Show) {
  if (queue.length >= 4) return;
  queue.push(show);
  if (!playing) next();
}

export const showPlaying = () => playing;

function seen(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}"); } catch { return {}; }
}
function markSeen(kind: string) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify({ ...seen(), [kind]: true })); } catch { /* ignore */ }
}

function next() {
  const show = queue.shift();
  if (!show) { playing = false; return; }
  playing = true;
  play(show, next);
}

const ease = (x: number) => Math.max(0, Math.min(1, x));

function play(show: Show, done: () => void) {
  const canSkip = !!seen()[show.kind];
  const bg = document.createElement("div");
  bg.className = `show-bg show-${show.kind}`;
  bg.innerHTML = `<div class="show">
    <div class="show-stage"><canvas width="${GRID * SCALE}" height="${GRID * SCALE}"></canvas><div class="show-flash"></div><div class="show-stamp">新收录</div></div>
    <div class="show-stars"></div>
    <div class="show-haptic"></div>
    <div class="show-result"><h2>${show.title}</h2>${show.lines.map((l) => `<p>${l}</p>`).join("")}<button class="primary small">好</button></div>
    <div class="show-skip">${canSkip ? "点一下跳过" : ""}</div>
  </div>`;
  document.body.appendChild(bg);
  const cv = bg.querySelector("canvas")!;
  const ctx = cv.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const flash = bg.querySelector<HTMLElement>(".show-flash")!;
  const stamp = bg.querySelector<HTMLElement>(".show-stamp")!;
  const stars = bg.querySelector<HTMLElement>(".show-stars")!;
  const haptic = bg.querySelector<HTMLElement>(".show-haptic")!;
  const result = bg.querySelector<HTMLElement>(".show-result")!;
  const off = document.createElement("canvas");
  const sil = document.createElement("canvas");

  const start = performance.now();
  let offset = reduced ? DURATION[show.kind] : 0;
  if (reduced) bg.classList.add("reduced");
  let raf = 0;
  let finished = false;

  const sprite = (spec: Spec, t: number, opts: { dx?: number; dy?: number; size?: number; silhouette?: string } = {}) => {
    drawSprite(off, { ...spec, frame: Math.floor(t / 250) });
    let src: HTMLCanvasElement = off;
    if (opts.silhouette) {
      sil.width = GRID; sil.height = GRID;
      const s = sil.getContext("2d")!;
      s.drawImage(off, 0, 0);
      s.globalCompositeOperation = "source-in";
      s.fillStyle = opts.silhouette;
      s.fillRect(0, 0, GRID, GRID);
      src = sil;
    }
    const size = (opts.size ?? 1) * GRID * SCALE;
    const x = (GRID * SCALE - size) / 2 + (opts.dx ?? 0) * SCALE;
    const y = (GRID * SCALE - size) / 2 + (opts.dy ?? 0) * SCALE;
    ctx.drawImage(src, Math.round(x), Math.round(y), size, size);
  };
  const orb = (x: number, y: number, r: number) => {
    ctx.fillStyle = "#ffffff";
    for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) if (xx * xx + yy * yy <= r * r) ctx.fillRect((x + xx) * SCALE, (y + yy) * SCALE, SCALE, SCALE);
  };
  const setFlash = (a: number) => { flash.style.opacity = String(a); };
  const setStars = (tier: number) => { stars.textContent = "★".repeat(tier + 1) + "☆".repeat(4 - tier); };

  const frame = (now: number) => {
    const t = now - start + offset;
    ctx.clearRect(0, 0, cv.width, cv.height);
    setFlash(0);
    if (reduced) {
      if (show.kind === "hatch") sprite(show.pet, 0);
      else if (show.kind === "evolve") sprite(show.to, 0);
      else if (show.kind === "rarity") { setStars(RARITIES.indexOf(show.to)); sprite({ ...show.pet, rarity: show.to }, 0); }
      else { sprite(show.wild, 0); stamp.classList.add("on"); }
      result.classList.add("on");
      haptic.textContent = "【震动：成功】";
      return;
    }

    if (show.kind === "hatch") {
      haptic.textContent = t < 4600 ? "【震动：开始】" : "【震动：成功】";
      if (t < 3000) {
        // three wobbles, each closer together than the last
        const wobbles: [number, number][] = [[0, 600], [1100, 1550], [1900, 2250]];
        const w = wobbles.find(([a, b]) => t >= a && t < b);
        const dx = w ? Math.round(Math.sin(((t - w[0]) / (w[1] - w[0])) * Math.PI * 4) * 1.5) : 0;
        sprite(show.egg, 0, { dx });
        if (t >= 2500) {
          ctx.fillStyle = "#1a1a1a";
          for (const [x, y] of [[24, 18], [23, 19], [24, 20], [25, 21], [24, 22], [26, 19], [27, 18]]) ctx.fillRect(x! * SCALE, y! * SCALE, SCALE, SCALE);
        }
      } else if (t < 3300) {
        setFlash(1 - (t - 3000) / 300);
      } else if (t < 4000) {
        sprite(show.pet, t, { silhouette: "#ffffff" });
      } else {
        const b = t < 4600 ? -Math.round(Math.sin(((t - 4000) / 600) * Math.PI) * 4) : 0;
        sprite({ ...show.pet, mood: "happy" }, t, { dy: b });
      }
    } else if (show.kind === "evolve") {
      haptic.textContent = t < 4400 ? "【震动：开始】" : "【震动：成功】";
      if (t < 1500) {
        sprite({ ...show.from, glow: true }, t);
      } else if (t < 3500) {
        // silhouettes swap faster and faster
        const p = (t - 1500) / 2000;
        const swaps = Math.floor(p * p * 24);
        sprite(swaps % 2 ? show.to : show.from, t, { silhouette: "#ffffff" });
      } else if (t < 3800) {
        sprite(show.to, t, { silhouette: "#ffffff" });
        setFlash(1 - (t - 3500) / 300);
      } else {
        const b = t < 4400 ? -Math.round(Math.sin(((t - 3800) / 600) * Math.PI) * 4) : 0;
        sprite({ ...show.to, mood: "happy" }, t, { dy: b });
      }
    } else if (show.kind === "capture") {
      haptic.textContent = t < 1600 ? "" : "【震动：成功】";
      if (t < 800) {
        sprite(show.wild, t, { dy: -Math.round(Math.abs(Math.sin((t / 400) * Math.PI)) * 2) });
      } else if (t < 1400) {
        const p = ease((t - 800) / 600);
        sprite(show.wild, t, { size: 1 - p * 0.85, silhouette: p > 0.5 ? "#ffffff" : undefined });
      } else if (t < 2000) {
        const p = ease((t - 1400) / 600);
        orb(24, Math.round(24 - p * 22), Math.max(1, Math.round(3 - p * 2)));
      }
      stamp.classList.toggle("on", t >= 2000);
    } else {
      // rarity: stars light one by one, with an extra beat before the new tier
      const from = RARITIES.indexOf(show.from);
      const to = RARITIES.indexOf(show.to);
      const steps = Math.max(1, to - from);
      const per = 1600 / steps;
      let tier = from;
      for (let k = 1; k <= steps; k++) if (t >= 300 + per * k + (k === steps ? 500 : 0)) tier = from + k;
      setStars(tier);
      sprite({ ...show.pet, rarity: RARITIES[tier]! }, t);
      haptic.textContent = tier === to ? "【震动：成功】" : "";
    }

    result.classList.toggle("on", t >= RESULT_AT[show.kind]);
    if (t < DURATION[show.kind] + 60000) raf = requestAnimationFrame(frame);
  };
  if (reduced) frame(performance.now());
  else raf = requestAnimationFrame(frame);

  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    markSeen(show.kind);
    // fade out over the app instead of cutting; the next queued show starts as this one leaves
    bg.classList.add("leaving");
    const gone = () => bg.remove();
    bg.addEventListener("animationend", gone, { once: true });
    setTimeout(gone, 400);
    done();
  };
  bg.addEventListener("click", (ev) => {
    const t = performance.now() - start + offset;
    if ((ev.target as HTMLElement).tagName === "BUTTON") return finish();
    if (t < RESULT_AT[show.kind] && canSkip) offset += RESULT_AT[show.kind] - t;
  });
}
