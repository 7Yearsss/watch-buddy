import type { AdultVariant, Cosmetics, ElementType } from "@pulseling/engine";

export const GRID = 32;

interface Palette {
  main: string;
  light: string;
  dark: string;
  outline: string;
  accent: string;
}

export const PALETTES: Record<ElementType, Palette> = {
  grass: { main: "#5bb04a", light: "#a6dd7c", dark: "#2f7a32", outline: "#16351a", accent: "#e8f06a" },
  water: { main: "#3f8fd8", light: "#8cc8f2", dark: "#245a9e", outline: "#10284a", accent: "#bfe9ff" },
  fire: { main: "#e8603c", light: "#f6a56b", dark: "#a8341f", outline: "#3b1a12", accent: "#ffd23f" },
  electric: { main: "#f2c81f", light: "#fff08a", dark: "#c08d0c", outline: "#3a2e05", accent: "#ffffff" },
  ground: { main: "#b08850", light: "#d9b77e", dark: "#7a5a30", outline: "#3a2a14", accent: "#e6d2a8" },
  fighting: { main: "#d0545a", light: "#f09ba0", dark: "#8f2a30", outline: "#3a1014", accent: "#f5e6c8" },
  flying: { main: "#8fb4e8", light: "#d2e4fb", dark: "#5a7fb8", outline: "#1e2c48", accent: "#ffffff" },
  shadow: { main: "#6a4fb0", light: "#a48be0", dark: "#3d2a78", outline: "#1a1030", accent: "#e14b8a" },
  dragon: { main: "#3fae9a", light: "#8fe0cf", dark: "#1f6e60", outline: "#0c302a", accent: "#f2c94c" },
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
  frame: number;
}

export function drawSprite(canvas: HTMLCanvasElement, spec: SpriteSpec) {
  canvas.width = GRID;
  canvas.height = GRID;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, GRID, GRID);
  const px = (x: number, y: number, c: string) => {
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return;
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  };
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };

  let pal = PALETTES[spec.primary];
  if (spec.shiny) pal = shinyOf(pal);
  const second = spec.secondary ? (spec.shiny ? shinyOf(PALETTES[spec.secondary]) : PALETTES[spec.secondary]) : null;
  const f = spec.frame;
  const bob = f % 2;

  if (spec.stage === "egg") {
    for (let y = -9; y <= 9; y++)
      for (let x = -7; x <= 7; x++) {
        const v = (x * x) / 49 + (y * y) / 81;
        if (v <= 1) px(16 + x, 17 + y + bob, v > 0.8 ? pal.outline : y < -3 && x < 0 ? pal.light : pal.main);
      }
    for (let x = -6; x <= 6; x += 3) px(16 + x, 18 + bob + (x % 2), pal.dark);
    return;
  }

  const r = { baby: 6, juvenile: 8, adult: 10, wild: 8 }[spec.stage];
  const cx = 16;
  const cy = 20 - (spec.stage === "baby" ? -1 : 0) + bob;

  const effect = spec.cosmetics?.effect;
  if (spec.cosmetics?.aura) {
    const rr = r + 5 + (f % 4 < 2 ? 0 : 1);
    for (let a = 0; a < 360; a += 12) px(cx + Math.cos((a * Math.PI) / 180) * rr, cy - 1 + Math.sin((a * Math.PI) / 180) * rr, "#ffe680");
  }

  if (second && spec.variant === "flying") {
    for (let i = 0; i < 6; i++) {
      const flap = f % 2 ? -1 : 0;
      rect(cx - r - 1 - i, cy - 4 + i + flap, 1, 6 - i, i === 0 ? second.outline : second.main);
      rect(cx + r + i, cy - 4 + i + flap, 1, 6 - i, i === 0 ? second.outline : second.main);
    }
  }
  if (second && spec.variant === "dragon") {
    for (let i = 0; i < 6; i++) px(cx + r + i, cy + 3 - Math.floor(i / 2), i === 5 ? second.accent : second.main);
  }
  if (second && spec.variant === "ground") {
    for (let i = -2; i <= 2; i++) {
      rect(cx + i * 3, cy - r - 2, 2, 2, second.dark);
      px(cx + i * 3, cy - r - 3, second.main);
    }
  }

  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++) {
      const v = (x * x) / (r * r) + (y * y) / ((r - 1) * (r - 1));
      if (v > 1) continue;
      const edge = (x * x) / ((r - 1) * (r - 1)) + (y * y) / ((r - 2) * (r - 2)) > 1;
      const c = edge ? pal.outline : x + y < -r / 2 ? pal.light : x + y > r ? pal.dark : pal.main;
      px(cx + x, cy + y, c);
    }

  if (spec.glow && f % 2 === 0) {
    for (let a = 0; a < 360; a += 8) px(cx + Math.cos((a * Math.PI) / 180) * (r + 1), cy + Math.sin((a * Math.PI) / 180) * r, "#fff6b0");
  }

  if (spec.stage !== "baby") {
    rect(cx - r / 2 - 1, cy + r - 1, 3, 2, pal.outline);
    rect(cx + r / 2 - 1, cy + r - 1, 3, 2, pal.outline);
  }

  const top = cy - r + 1;
  const big = spec.stage === "adult" && (spec.variant === "pure" || !spec.variant) ? 2 : spec.stage === "baby" ? 0 : 1;
  if (spec.primary === "grass") {
    rect(cx, top - 2 - big, 1, 2 + big, pal.dark);
    rect(cx + 1, top - 3 - big, 2 + big, 2, pal.light);
    if (big >= 1) rect(cx - 2 - big, top - 2 - big, 2 + big, 2, pal.main);
  } else if (spec.primary === "water") {
    for (let i = 0; i <= 2 + big; i++) rect(cx - i + 1, top - 3 - big + i, 1 + i, 1, i === 0 ? pal.accent : pal.light);
  } else if (spec.primary === "fire") {
    const flick = f % 2;
    rect(cx - 1, top - 2 - big, 3, 2 + big, pal.accent);
    px(cx + flick, top - 3 - big - 1, pal.accent);
    if (big >= 1) {
      px(cx - 2, top - 1 - flick, pal.light);
      px(cx + 2, top - 2 + flick, pal.light);
    }
  } else {
    const p2 = PALETTES[spec.primary];
    rect(cx - 2, top - 2, 1, 2, p2.dark);
    rect(cx + 2, top - 2, 1, 2, p2.dark);
  }

  if (second && spec.variant === "dragon") {
    rect(cx - 4, top - 2, 1, 3, second.accent);
    rect(cx + 4, top - 2, 1, 3, second.accent);
  }

  const ey = cy - 1;
  const ex = Math.max(2, Math.round(r / 2.6));
  const eyes = spec.cosmetics?.eyes;
  const sleepy = spec.mood === "sleepy" || eyes === "sleepy";
  for (const sx of [-1, 1]) {
    const x = cx + sx * ex;
    if (sleepy) {
      rect(x - 1, ey + 1, 2, 1, pal.outline);
    } else if (eyes === "heart") {
      px(x - 1, ey, "#e0466e");
      px(x, ey, "#e0466e");
      px(x - 1, ey + 1, "#e0466e");
      px(x, ey + 1, "#e0466e");
    } else if (eyes === "star") {
      rect(x - 1, ey, 2, 2, pal.outline);
      px(x, ey, "#ffe066");
    } else {
      rect(x - 1, ey, 2, 2, pal.outline);
      px(x - 1, ey, eyes === "sparkle" ? "#ffffff" : "#dfe9ff");
      if (eyes === "sparkle" && f % 2) px(x - 2, ey - 1, "#ffffff");
    }
    px(x + sx * 2, ey + 2, "#f5a6a6");
  }
  if (spec.mood === "bored") rect(cx - 1, ey + 3, 2, 1, pal.outline);
  else px(cx, ey + 3, pal.outline);

  if (second && spec.variant === "fighting") {
    rect(cx - r + 1, top + 1, 2 * r - 2, 1, second.main);
    px(cx + r - 1, top + 2, second.main);
    rect(cx - r - 2, cy + 1, 3, 3, second.main);
    rect(cx + r, cy + 1, 3, 3, second.main);
  }

  const acc = spec.cosmetics?.accessory;
  if (acc) {
    const hy = top - 1;
    if (acc === "beanie") rect(cx - 4, hy - 1, 9, 2, "#e35d6a"), px(cx, hy - 2, "#ffffff");
    else if (acc === "tiny-crown") rect(cx - 3, hy - 1, 7, 2, "#ffcf33"), px(cx - 3, hy - 2, "#ffcf33"), px(cx, hy - 2, "#ffcf33"), px(cx + 3, hy - 2, "#ffcf33");
    else if (acc === "leaf-cap") rect(cx - 4, hy - 1, 8, 2, "#3f8d3a"), rect(cx + 2, hy, 4, 1, "#3f8d3a");
    else if (acc === "flower") rect(cx + 3, hy, 2, 2, "#ff9ad5"), px(cx + 3, hy + 1, "#ffe066");
    else if (acc === "headband") rect(cx - r + 1, top + 2, 2 * r - 2, 1, "#ffffff");
    else if (acc === "bow") rect(cx + 2, hy, 2, 2, "#ff6fa8"), rect(cx + 5, hy, 2, 2, "#ff6fa8"), px(cx + 4, hy + 1, "#c2185b");
    else if (acc === "goggles") rect(cx - 4, ey - 1, 3, 3, "#7ad3ff"), rect(cx + 2, ey - 1, 3, 3, "#7ad3ff");
    else if (acc === "scarf") rect(cx - r + 2, cy + r - 3, 2 * r - 4, 2, "#f2a541"), rect(cx + 2, cy + r - 1, 2, 2, "#f2a541");
  }

  if (effect) {
    const color = { petals: "#ffb3d9", sparks: "#ffe066", bubbles: "#bfe9ff", notes: "#ffffff" }[effect] ?? "#ffffff";
    for (let i = 0; i < 4; i++) {
      const a = ((f * 25 + i * 90) * Math.PI) / 180;
      px(cx + Math.cos(a) * (r + 3), cy - 2 + Math.sin(a) * (r + 2), color);
    }
  }
}
