import type { AdultVariant, Cosmetics, ElementType } from "@pulseling/engine";

export const GRID = 40;

interface Palette {
  main: string;
  light: string;
  dark: string;
  outline: string;
  accent: string;
  belly: string;
}

export const PALETTES: Record<ElementType, Palette> = {
  grass: { main: "#5bb04a", light: "#9fdc6f", dark: "#2f7a32", outline: "#173d1c", accent: "#e8f06a", belly: "#e6f5c9" },
  water: { main: "#3f8fd8", light: "#86c8f4", dark: "#245a9e", outline: "#102a52", accent: "#d6f2ff", belly: "#dff1ff" },
  fire: { main: "#ee6a3c", light: "#ffa66b", dark: "#ad3820", outline: "#4a1810", accent: "#ffd23f", belly: "#ffe4c2" },
  electric: { main: "#f2c81f", light: "#fff08a", dark: "#c08d0c", outline: "#4a3606", accent: "#ffffff", belly: "#fff7d1" },
  ground: { main: "#b88a52", light: "#dcb882", dark: "#7a5a30", outline: "#3a2a14", accent: "#efdcb0", belly: "#f1e2c4" },
  fighting: { main: "#d0545a", light: "#f39aa0", dark: "#8f2a30", outline: "#3f1216", accent: "#f5e6c8", belly: "#fbe0de" },
  flying: { main: "#93b8ea", light: "#d4e6fc", dark: "#5c80ba", outline: "#1e2c4c", accent: "#ffffff", belly: "#f0f6ff" },
  shadow: { main: "#6a4fb0", light: "#a48be0", dark: "#3d2a78", outline: "#170e2c", accent: "#ff5c9d", belly: "#d8cdf5" },
  dragon: { main: "#3fae9a", light: "#86e0cd", dark: "#1f6e60", outline: "#0c302a", accent: "#f2c94c", belly: "#dff5d6" },
};

function hueShift(hex: string, deg: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = (h * 60 + deg + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

const shinyOf = (p: Palette): Palette => ({
  main: hueShift(p.main, 150),
  light: hueShift(p.light, 150),
  dark: hueShift(p.dark, 150),
  outline: p.outline,
  accent: hueShift(p.accent, 150),
  belly: hueShift(p.belly, 150),
});

export interface SpriteSpec {
  primary: ElementType;
  secondary?: ElementType | null;
  stage: "egg" | "baby" | "juvenile" | "adult" | "wild";
  variant?: AdultVariant;
  shiny?: boolean;
  cosmetics?: Cosmetics;
  mood?: "happy" | "sleepy" | "bored";
  /** Pulsing outline when evolution is close. */
  glow?: boolean;
  /** Varies the silhouette of wild monsters. */
  seed?: string;
  frame: number;
}

/**
 * Pixel layer with "fill then auto-shade then auto-outline": shapes are filled with a flat base colour, then every
 * pixel gets a highlight if its top/left neighbour is empty and a shadow if its bottom/right neighbour is empty,
 * and finally a 1px outline is traced around the whole silhouette. That gives clean, readable pixel art from
 * simple primitives.
 */
class Layer {
  base: (Palette | null)[] = new Array(GRID * GRID).fill(null);
  flat: (string | null)[] = new Array(GRID * GRID).fill(null);
  private i = (x: number, y: number) => (x < 0 || y < 0 || x >= GRID || y >= GRID ? -1 : y * GRID + x);

  fill(x: number, y: number, pal: Palette) {
    const i = this.i(Math.round(x), Math.round(y));
    if (i >= 0) this.base[i] = pal;
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, pal: Palette) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.fill(x, y, pal);
  }
  poly(points: [number, number][], pal: Palette) {
    const ys = points.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const xs: number[] = [];
      for (let k = 0; k < points.length; k++) {
        const [x1, y1] = points[k]!;
        const [x2, y2] = points[(k + 1) % points.length]!;
        if ((y1 <= y + 0.5 && y2 > y + 0.5) || (y2 <= y + 0.5 && y1 > y + 0.5)) xs.push(x1 + ((y + 0.5 - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.ceil(xs[k]! - 0.5); x <= Math.floor(xs[k + 1]! - 0.5); x++) this.fill(x, y, pal);
    }
  }
  /** Detail pixels drawn after shading, never outlined. */
  dot(x: number, y: number, c: string) {
    const i = this.i(Math.round(x), Math.round(y));
    if (i >= 0) this.flat[i] = c;
  }
  rect(x: number, y: number, w: number, h: number, c: string) {
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) this.dot(x + xx, y + yy, c);
  }
  filled(x: number, y: number) {
    const i = this.i(x, y);
    return i >= 0 && this.base[i] !== null;
  }
  render(ctx: CanvasRenderingContext2D) {
    const out: (string | null)[] = new Array(GRID * GRID).fill(null);
    for (let y = 0; y < GRID; y++)
      for (let x = 0; x < GRID; x++) {
        const p = this.base[y * GRID + x];
        if (!p) {
          const n = [this.base[this.i(x - 1, y)] ?? null, this.base[this.i(x + 1, y)] ?? null, this.base[this.i(x, y - 1)] ?? null, this.base[this.i(x, y + 1)] ?? null].find(Boolean);
          if (n && this.i(x, y) >= 0) out[y * GRID + x] = n.outline;
          continue;
        }
        const topEmpty = !this.filled(x, y - 1) || !this.filled(x - 1, y - 1);
        const bottomEmpty = !this.filled(x, y + 1) || !this.filled(x + 1, y + 1) || !this.filled(x, y + 2);
        out[y * GRID + x] = topEmpty ? p.light : bottomEmpty ? p.dark : p.main;
      }
    for (let k = 0; k < out.length; k++) {
      const c = this.flat[k] ?? out[k];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(k % GRID, Math.floor(k / GRID), 1, 1);
    }
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function drawSprite(canvas: HTMLCanvasElement, spec: SpriteSpec) {
  canvas.width = GRID;
  canvas.height = GRID;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, GRID, GRID);

  let pal = PALETTES[spec.primary];
  if (spec.shiny) pal = shinyOf(pal);
  let second = spec.secondary ? PALETTES[spec.secondary] : null;
  if (second && spec.shiny) second = shinyOf(second);
  const f = spec.frame;
  const phase = f % 4;
  const lift = phase === 1 ? -1 : 0;
  const squash = phase === 3 ? 1 : 0;
  const L = new Layer();
  const cx = 20;

  if (spec.stage === "egg") {
    const wobble = phase === 1 ? -1 : phase === 3 ? 1 : 0;
    L.ellipse(cx + wobble * 0.3, 23, 8, 10, pal);
    L.render(ctx);
    const zig = [[-7, 22], [-4, 20], [-1, 22], [2, 20], [5, 22], [7, 21]];
    ctx.fillStyle = pal.dark;
    for (const [x, y] of zig) ctx.fillRect(cx + x!, y!, 1, 1);
    ctx.fillStyle = pal.belly;
    ctx.fillRect(cx - 4, 17, 2, 2);
    return;
  }

  const size = { baby: 7, juvenile: 9, adult: 11, wild: 9 }[spec.stage];
  const wildShape = spec.stage === "wild" ? hash(spec.seed ?? spec.primary) % 3 : 0;
  const rx = size + squash + (wildShape === 2 ? 1 : 0);
  const ry = size - 1 - squash + (wildShape === 1 ? 1 : 0);
  const groundY = 34;
  const cy = groundY - ry - (spec.stage === "baby" ? 1 : 3) + lift;
  const top = cy - ry;

  ctx.fillStyle = "rgba(0,0,0,0.28)";
  for (let x = -rx + 1; x <= rx - 1; x++) ctx.fillRect(cx + x, groundY + 1, 1, 1);
  for (let x = -rx + 3; x <= rx - 3; x++) ctx.fillRect(cx + x, groundY + 2, 1, 1);

  if (spec.cosmetics?.aura) {
    const rr = rx + 6 + (phase < 2 ? 0 : 1);
    ctx.fillStyle = "#ffe680";
    for (let a = 0; a < 360; a += 10) ctx.fillRect(Math.round(cx + Math.cos((a * Math.PI) / 180) * rr), Math.round(cy + Math.sin((a * Math.PI) / 180) * (ry + 6)), 1, 1);
  }

  const v = spec.stage === "adult" ? spec.variant ?? "pure" : undefined;

  if (second && v === "flying") {
    const flap = f % 2 ? -2 : 0;
    for (const s of [-1, 1]) {
      L.poly([[cx + s * (rx - 2), cy - 2], [cx + s * (rx + 8), cy - 7 + flap], [cx + s * (rx + 9), cy + 1 + flap], [cx + s * (rx + 2), cy + 4]], second);
    }
  }
  if (second && v === "dragon") {
    L.poly([[cx + rx - 3, cy + 3], [cx + rx + 6, cy + 1], [cx + rx + 8, cy - 2], [cx + rx + 7, cy + 4], [cx + rx - 1, cy + 6]], second);
    for (const s of [-1, 1]) L.poly([[cx + s * (rx - 3), cy - 4], [cx + s * (rx + 5), cy - 9], [cx + s * (rx + 3), cy - 1]], second);
  }
  if (second && v === "ground") {
    for (let k = -2; k <= 2; k++) L.poly([[cx + k * 4 - 2, top + 3], [cx + k * 4, top - 3 - (k === 0 ? 2 : 0)], [cx + k * 4 + 2, top + 3]], second);
  }
  if (spec.primary === "water" && spec.stage !== "baby") {
    L.poly([[cx + rx - 3, cy + 2], [cx + rx + 5, cy - 2 + (f % 2)], [cx + rx + 4, cy + 5], [cx + rx - 1, cy + 6]], pal);
  }
  if (spec.primary === "fire" && spec.stage !== "baby") {
    const flick = f % 2;
    L.poly([[cx + rx - 3, cy + 3], [cx + rx + 3, cy - 3 - flick], [cx + rx + 2, cy + 5]], PALETTES.fire === pal ? { ...pal, main: pal.accent, light: "#fff3b0", dark: pal.main } : pal);
  }

  L.ellipse(cx, cy, rx, ry, pal);

  if (spec.stage !== "baby") {
    const fy = cy + ry - 1;
    for (const s of [-1, 1]) L.ellipse(cx + s * (rx * 0.5), fy, 2.5, 1.8, pal);
    if (spec.stage === "adult" || spec.stage === "juvenile") for (const s of [-1, 1]) L.ellipse(cx + s * (rx - 0.5), cy + 2, 1.6, 2.4, pal);
  }

  if (second && v === "fighting") for (const s of [-1, 1]) L.ellipse(cx + s * (rx + 2), cy + 1 - (f % 2), 2.6, 2.6, second);

  const crestBig = v === "pure" ? 2 : spec.stage === "baby" ? 0 : 1;
  if (spec.primary === "grass") {
    const sway = f % 2;
    const leaf = { ...pal, main: pal.light, light: "#d7f5a8", dark: pal.main };
    L.poly([[cx, top + 1], [cx - 1, top - 2 - crestBig], [cx + 1, top - 2 - crestBig]], pal);
    L.ellipse(cx + 3 + sway, top - 3 - crestBig, 3 + crestBig * 0.6, 1.6 + crestBig * 0.3, leaf);
    if (crestBig >= 1) L.ellipse(cx - 3 - sway, top - 2 - crestBig, 2.4 + crestBig * 0.5, 1.4, leaf);
  } else if (spec.primary === "water") {
    L.poly([[cx - 2, top + 2], [cx + 1, top - 3 - crestBig * 2], [cx + 3, top - 1 - crestBig], [cx + 2, top + 2]], pal);
  } else if (spec.primary === "fire") {
    const flame = { ...pal, main: pal.accent, light: "#fff3b0", dark: pal.main };
    const flick = f % 2;
    L.poly([[cx - 3 - crestBig, top + 2], [cx - 1, top - 3 - crestBig * 2 - flick], [cx + 1, top - 1 - crestBig], [cx + 3, top - 4 - crestBig * 2 + flick], [cx + 3 + crestBig, top + 2]], flame);
  } else {
    for (const s of [-1, 1]) L.poly([[cx + s * 4, top + 2], [cx + s * 5, top - 3], [cx + s * 2, top + 1]], pal);
  }

  if (second && v === "dragon") for (const s of [-1, 1]) L.poly([[cx + s * 2, top + 1], [cx + s * 4, top - 4], [cx + s * 4, top + 1]], { ...second, main: second.accent, light: "#fff6c8", dark: second.dark });

  L.ellipse(cx, cy + ry * 0.35, rx * 0.55, ry * 0.45, { ...pal, main: pal.belly, light: pal.belly, dark: pal.belly });

  if (spec.glow && f % 2 === 0) {
    for (let a = 0; a < 360; a += 6) L.dot(cx + Math.cos((a * Math.PI) / 180) * (rx + 2), cy + Math.sin((a * Math.PI) / 180) * (ry + 2), "#fff6b0");
  }

  const eyeY = cy - Math.round(ry * 0.2);
  const eyeX = Math.max(2, Math.round(rx * 0.42));
  const eyes = spec.cosmetics?.eyes;
  const blink = f % 9 === 0;
  const sleepy = spec.mood === "sleepy" || eyes === "sleepy";
  for (const s of [-1, 1]) {
    const x = cx + s * eyeX;
    if (sleepy || blink) {
      L.rect(x - 1, eyeY + 1, 3, 1, pal.outline);
    } else if (eyes === "heart") {
      L.dot(x - 1, eyeY, "#e0466e"); L.dot(x + 1, eyeY, "#e0466e");
      L.rect(x - 1, eyeY + 1, 3, 1, "#e0466e");
      L.dot(x, eyeY + 2, "#e0466e");
    } else {
      L.rect(x - 1, eyeY - 1, 3, 4, pal.outline);
      L.dot(x - 1, eyeY - 1, "#ffffff");
      if (eyes === "star") L.dot(x + 1, eyeY + 2, "#ffe066");
      if (eyes === "sparkle") { L.dot(x, eyeY - 1, "#ffffff"); if (f % 2) L.dot(x - 2, eyeY - 2, "#ffffff"); }
    }
    L.rect(x + s * 2 - (s > 0 ? 1 : 0), eyeY + 3, 2, 1, "#f59aa8");
  }
  if (spec.mood === "bored") L.rect(cx - 1, eyeY + 4, 3, 1, pal.outline);
  else if (spec.mood === "happy") {
    L.dot(cx - 1, eyeY + 3, pal.outline); L.dot(cx, eyeY + 4, pal.outline); L.dot(cx + 1, eyeY + 3, pal.outline);
  } else L.dot(cx, eyeY + 4, pal.outline);

  if (spec.primary === "water") for (const [dx, dy] of [[-rx + 3, 1], [rx - 4, 3], [-2, ry - 3]]) L.dot(cx + dx!, cy + dy!, pal.light);
  if (spec.primary === "grass") for (const [dx, dy] of [[-rx + 3, 2], [rx - 4, 1]]) L.rect(cx + dx!, cy + dy!, 2, 1, pal.dark);
  if (spec.primary === "fire") for (const s of [-1, 1]) L.dot(cx + s * (rx - 3), cy - 1, pal.accent);

  if (second && v === "fighting") {
    L.rect(cx - rx + 2, top + 3, 2 * rx - 3, 1, second.main);
    L.rect(cx + rx - 2, top + 3 + (f % 2), 3, 1, second.main);
    L.rect(cx + rx, top + 4 - (f % 2), 2, 1, second.main);
  }
  if (second && v === "ground") for (const s of [-1, 1]) L.rect(cx + s * (rx - 4) - 1, cy + 1, 3, 1, second.dark);

  const acc = spec.cosmetics?.accessory;
  if (acc) {
    const hy = top + 1;
    if (acc === "beanie") { L.rect(cx - 5, hy - 1, 11, 2, "#e35d6a"); L.rect(cx - 5, hy + 1, 11, 1, "#b33a48"); L.rect(cx - 1, hy - 3, 2, 2, "#ffffff"); }
    else if (acc === "tiny-crown") { L.rect(cx - 4, hy - 1, 9, 2, "#ffcf33"); for (const dx of [-4, 0, 4]) L.dot(cx + dx, hy - 2, "#ffcf33"); L.dot(cx, hy - 1, "#e0466e"); }
    else if (acc === "leaf-cap") { L.rect(cx - 5, hy - 1, 10, 2, "#3f8d3a"); L.rect(cx + 3, hy + 1, 5, 1, "#2f6d2a"); }
    else if (acc === "flower") { L.rect(cx + 4, hy - 1, 3, 3, "#ff9ad5"); L.dot(cx + 5, hy, "#ffe066"); }
    else if (acc === "headband") L.rect(cx - rx + 2, top + 3, 2 * rx - 3, 1, "#ffffff");
    else if (acc === "bow") { L.rect(cx + 2, hy - 1, 3, 3, "#ff6fa8"); L.rect(cx + 6, hy - 1, 3, 3, "#ff6fa8"); L.dot(cx + 5, hy, "#c2185b"); }
    else if (acc === "goggles") { L.rect(cx - eyeX - 2, eyeY - 2, 5, 5, "#7ad3ff"); L.rect(cx + eyeX - 2, eyeY - 2, 5, 5, "#7ad3ff"); L.rect(cx - eyeX + 3, eyeY, 2 * eyeX - 5, 1, "#3a3a3a"); }
    else if (acc === "scarf") { L.rect(cx - rx + 3, cy + ry - 4, 2 * rx - 5, 2, "#f2a541"); L.rect(cx + 3, cy + ry - 2, 2, 3, "#e08a24"); }
  }

  const effect = spec.cosmetics?.effect;
  if (effect) {
    const color = { petals: "#ffb3d9", sparks: "#ffe066", bubbles: "#bfe9ff", notes: "#ffffff" }[effect] ?? "#ffffff";
    for (let k = 0; k < 4; k++) {
      const a = ((f * 22 + k * 90) * Math.PI) / 180;
      L.dot(cx + Math.cos(a) * (rx + 4), cy - 2 + Math.sin(a) * (ry + 3), color);
    }
  }

  L.render(ctx);
}
