/**
 * Pixel-style pet draft built on the cuteness rules creature designers use (big head, low wide-set eyes with
 * highlights, stubby limbs, one signature silhouette feature, coloured outlines instead of black). Only the
 * fire baby is designed; water and grass are palette swaps to check the shape survives a recolour.
 */
export type CuteElement = "fire" | "water" | "grass";
export type CuteAction = "idle" | "happy" | "sleepy" | "sleep";

const G = 48;

/** Colour keys used by the hand-authored maps below. */
type Key = "o" | "O" | "d" | "m" | "l" | "h" | "b" | "B" | "r" | "y" | "w" | "F" | "k" | "e" | "q" | "p" | "n" | "t" | "z";

const PAL: Record<CuteElement, Record<Key, string>> = {
  fire: {
    o: "#5a1d14", O: "#a3381f", d: "#cf4f2c", m: "#f26c3b", l: "#ff9a5e", h: "#ffc79a", b: "#ffe6c8", B: "#f6c59b",
    r: "#ff6a2a", y: "#ffc93c", w: "#fff3b5", F: "#9c2a10",
    k: "#2b1611", e: "#ffffff", q: "#8c5143", p: "#ff8fa0", n: "#6e2216", t: "#ff6f86", z: "#ffffff",
  },
  water: {
    o: "#122b55", O: "#2b5c9e", d: "#2f6cc0", m: "#4b93e0", l: "#82c0f5", h: "#c4e6ff", b: "#e4f4ff", B: "#b9dcf6",
    r: "#3f8fe0", y: "#9ad8ff", w: "#ecf9ff", F: "#1d4f96",
    k: "#13213a", e: "#ffffff", q: "#4f6a8f", p: "#ff9fb8", n: "#1a2f55", t: "#ff7f9e", z: "#ffffff",
  },
  grass: {
    o: "#173d1c", O: "#2f7a32", d: "#3f9640", m: "#5fb84c", l: "#97da70", h: "#cdf0a6", b: "#eef8d6", B: "#cfe8ad",
    r: "#3f9a3a", y: "#9ee06a", w: "#e2f9b8", F: "#1f5e22",
    k: "#162414", e: "#ffffff", q: "#4f6f45", p: "#ff9fa8", n: "#1f3d1d", t: "#ff7f8e", z: "#ffffff",
  },
};

// Head flame (signature feature): a single curly wisp, two frames so it flickers. Bottom row overlaps the head.
const FLAME = [
  [
    "...r.....",
    "..rr.....",
    "..ryr....",
    "...ryr...",
    "..ryyr...",
    ".ryyyyr..",
    ".rywwyr.r",
    "rryywwyrr",
    "ryywwwyyr",
    "ryywwwyyr",
    ".ryyyyyr.",
  ],
  [
    ".....r...",
    "....rr...",
    "...ryr...",
    "..ryr....",
    "..ryyr...",
    ".ryyyr.r.",
    "rrywwyrr.",
    "ryywwyyr.",
    "ryywwwyyr",
    "ryywwwyyr",
    ".ryyyyyr.",
  ],
];

// Ember tail: an off-centre accent so the silhouette is not perfectly symmetric.
const TAIL = [
  ["..r..", ".ryr.", "ryyr.", "rywyr", ".rrr."],
  [".r...", ".ryr.", "ryyr.", "rywyr", ".rrr."],
];

// 5×6 eyes with a 2×2 catch-light; "." keeps the body colour.
const EYES: Record<string, string[]> = {
  open: [".kkk.", "keekk", "keekk", "kkkkk", "kkkqk", ".kkk."],
  blink: [".....", ".....", ".....", ".....", "kkkkk", "....."],
  happy: [".....", ".....", ".kkk.", "k...k", ".....", "....."],
  closed: [".....", ".....", ".....", "k...k", ".kkk.", "....."],
  sleepy: [".....", ".....", ".....", "kkkkk", "keekk", ".kkk."],
};
const MOUTHS: Record<string, string[]> = {
  smile: ["n.n", ".n."],
  open: ["nnnnn", ".ntn."],
  small: [".n.", "..."],
  sleep: [".n.", "..."],
};

interface Frame { lift: number; sx: number; sy: number; eyes: keyof typeof EYES; mouth: keyof typeof MOUTHS; flame: number; z: number }

function frameOf(action: CuteAction, f: number): Frame {
  const breathe = Math.floor(f / 3) % 2; // slow 2-step breathing
  const flame = Math.floor(f / 2) % 2;
  switch (action) {
    case "idle":
      return { lift: 0, sx: breathe, sy: -breathe, eyes: f % 26 === 0 ? "blink" : "open", mouth: "smile", flame, z: -1 };
    case "happy": {
      const hop = [0, -3, -5, -5, -3, 0, 0, 0][f % 8]!;
      const land = f % 8 === 5 || f % 8 === 0;
      return { lift: hop, sx: land ? 2 : hop < -2 ? -1 : 0, sy: land ? -2 : hop < -2 ? 1 : 0, eyes: "happy", mouth: "open", flame: f % 2, z: -1 };
    }
    case "sleepy":
      return { lift: 0, sx: 1, sy: -1 - breathe, eyes: f % 20 < 3 ? "blink" : "sleepy", mouth: "small", flame, z: -1 };
    case "sleep":
      return { lift: 0, sx: 2, sy: -2 - (Math.floor(f / 4) % 2), eyes: "closed", mouth: "sleep", flame: Math.floor(f / 4) % 2, z: Math.floor(f / 3) % 4 };
  }
}

export interface CuteSpec { element: CuteElement; action: CuteAction; frame: number; silhouette?: boolean }

export function drawCute(canvas: HTMLCanvasElement, spec: CuteSpec) {
  canvas.width = G;
  canvas.height = G;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, G, G);
  const P = PAL[spec.element];
  const fr = frameOf(spec.action, spec.frame);

  // kind: 0 empty, 1 body, 2 flame, 3 foot
  const kind = new Uint8Array(G * G);
  const col: (Key | null)[] = new Array(G * G).fill(null);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= G || y >= G ? -1 : y * G + x);
  const set = (x: number, y: number, k: number, c: Key) => { const i = at(x, y); if (i >= 0) { kind[i] = k; col[i] = c; } };

  const ground = 44;
  const cx = 24;
  const rx = 13 + fr.sx;
  const ryTop = 11 + fr.sy;
  const ryBot = 10;
  const cy = ground - 2 - ryBot + fr.lift;
  const top = Math.round(cy - ryTop);

  // ground shadow shrinks while airborne
  const shW = Math.max(6, 11 + fr.sx + Math.round(fr.lift / 1.5));
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(cx - shW, ground, shW * 2, 1);
  ctx.fillRect(cx - shW + 2, ground + 1, shW * 2 - 4, 1);

  // tail first so the body overlaps it
  const tail = TAIL[fr.flame]!;
  tail.forEach((row, y) => [...row].forEach((c, x) => { if (c !== ".") set(cx + rx - 3 + x, cy + 1 + y, 2, c as Key); }));

  // feet: stubby ovals peeking out under the bun
  for (const s of [-1, 1]) {
    const fx = cx + s * 6, fy = cy + ryBot;
    for (let y = -2; y <= 2; y++) for (let x = -4; x <= 4; x++)
      if ((x / 3.6) ** 2 + (y / 1.9) ** 2 <= 1) set(fx + x, fy + y, 3, y <= -1 ? "m" : "d");
  }

  // body bun, shaded by its surface normal against an upper-left light
  for (let y = top; y <= cy + ryBot; y++)
    for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
      const nx = (x - cx) / (rx + 0.4);
      const ny = (y - cy) / ((y < cy ? ryTop : ryBot) + 0.4);
      if (nx * nx + ny * ny > 1) continue;
      // radial falloff from a light spot up-left reads as a soft ball instead of diagonal stripes
      const dl = Math.hypot((x - (cx - 6)) / (rx * 1.55), (y - (cy - 7)) / (ryTop * 1.55));
      const rim = nx * 0.5 + ny * 0.85 > 0.78; // thin shadow along the lower-right edge
      const c: Key = rim ? "d" : dl < 0.2 ? "h" : dl < 0.5 ? "l" : dl < 0.93 ? "m" : "d";
      set(x, y, 1, c);
    }
  // belly patch, low on the body
  const bcy = cy + 7;
  for (let y = bcy - 4; y <= cy + ryBot; y++)
    for (let x = cx - 9; x <= cx + 9; x++) {
      const i = at(x, y);
      if (i < 0 || kind[i] !== 1) continue;
      if (((x - cx) / 8.5) ** 2 + ((y - bcy) / 4.6) ** 2 <= 1) col[i] = (x - cx) / 8.5 + (y - bcy) / 4.6 > 0.75 ? "B" : "b";
    }
  // hand-placed specular, the "shine" that makes it read as soft and round
  for (const [x, y, c] of [[-7, -8, "h"], [-6, -8, "h"], [-8, -7, "h"], [-7, -7, "w"]] as const) set(cx + x, cy + y, 1, c as Key);

  // head flame on top, bottom row tucked into the head
  const flame = FLAME[fr.flame]!;
  flame.forEach((row, y) => [...row].forEach((c, x) => { if (c !== ".") set(cx - 4 + x, top - flame.length + 3 + y, 2, c as Key); }));

  // outline: flame gets a hot dark edge; body uses a lighter "sel-out" edge on the lit upper-left
  const out: (Key | null)[] = col.slice();
  for (let y = 0; y < G; y++)
    for (let x = 0; x < G; x++) {
      const i = at(x, y);
      if (kind[i]) {
        // inner line where a foot meets the body above it
        if (kind[i] === 3 && kind[at(x, y - 1)] === 1) out[i] = "o";
        continue;
      }
      const ns = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].filter((j) => j >= 0 && kind[j]);
      if (!ns.length) continue;
      const k = kind[ns[0]!]!;
      out[i] = k === 2 ? "F" : x < cx - 3 && y < cy - 2 ? "O" : "o";
    }

  // face: eyes low and wide, blush under the outer corners, tiny mouth
  const stamp = (map: string[], x0: number, y0: number) => map.forEach((row, y) => [...row].forEach((c, x) => { if (c !== ".") { const i = at(x0 + x, y0 + y); if (i >= 0) out[i] = c as Key; } }));
  const eyeY = cy - 2;
  stamp(EYES[fr.eyes]!, cx - 10, eyeY);
  stamp(EYES[fr.eyes]!, cx + 6, eyeY);
  for (const x of [cx - 12, cx - 11, cx + 11, cx + 12]) { const i = at(x, eyeY + 6); if (i >= 0) out[i] = "p"; }
  const m = MOUTHS[fr.mouth]!;
  stamp(m, cx - Math.floor(m[0]!.length / 2), eyeY + 5);

  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (!c) continue;
    ctx.fillStyle = spec.silhouette ? "#000" : P[c];
    ctx.fillRect(i % G, Math.floor(i / G), 1, 1);
  }

  if (fr.z >= 0 && !spec.silhouette) {
    const zx = cx + 10 + fr.z, zy = top - 2 - fr.z * 2;
    ctx.fillStyle = P.z;
    ctx.globalAlpha = 1 - fr.z * 0.22;
    for (const [x, y] of [[0, 0], [1, 0], [2, 0], [1, 1], [0, 2], [1, 2], [2, 2]]) ctx.fillRect(zx + x!, zy + y!, 1, 1);
    ctx.globalAlpha = 1;
  }
}
