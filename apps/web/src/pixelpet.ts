/**
 * Hand-cleaned pixel pet: a red-panda fire cub in 3/4 view, waving. Every pixel is authored in character maps
 * (one char per pixel) instead of being computed, following what Pokémon's GBA/DS sprites do: under 16 colours,
 * outlines tinted per region and lighter on the lit side, hue-shifted ramps (shadows toward red-purple, lights
 * toward yellow), interior structure lines, small eyes with a catch-light, and a separately drawn small icon.
 */
export type PxAction = "idle" | "happy" | "sleepy" | "sleep";

export const PX_PALETTE: Record<string, string> = {
  o: "#4a1712", O: "#7a2a1c", R: "#c2361c",
  "1": "#8c2a22", "2": "#c4452c", "3": "#e8693a", "4": "#ff9a52",
  c: "#fff2dc", C: "#efc9a4",
  b: "#4c2420", B: "#6e3428",
  y: "#ffcf3f", w: "#fff4b0",
  k: "#20100c", e: "#ffffff", t: "#ff7a80",
};

// 40×44 body without eyes, mouth or flame: those are stamped per frame below.
const BASE = [
  "........................................",
  "........................................",
  "........................................",
  "........................................",
  "........................................",
  "........................o...............",
  ".....OOOOO............oo4oo.............",
  "....O44433O..........o44c33o............",
  "...O4cccc33O.........o4ccc3o............",
  "...O4cccc332OOOoooooo33cccc2o...........",
  "...O3ccccC1144444444113ccCC2o...........",
  "...O3ccC1144444444433311CC2o............",
  "...O33C14444444444333333122o............",
  "....O214444444443333333331o.............",
  ".....Occc44444333ccc333333o.............",
  "....O4ccC44433333ccC3333333o............",
  "....O4444433333333333333332o............",
  "....O4443333333333333333222o............",
  "....O4333333333333333322222o............",
  "...Occc333333333333332222222o...........",
  "....Occcccccc33333332222222o.ooooooo....",
  "....Occccccccccc32222222222o.o44433o....",
  "....Occcccckkcccc2222222222o.o43333o....",
  "....OttCcccccccccc222222222o.o433333o...",
  ".....oCCcccccccccC22222222o..o433333o...",
  "......occcccccCCCC2222222o...o233332o...",
  ".......occccCCCCC2222222o....o222222o...",
  "........ooCCCCCC222222oo.....o222222o...",
  "..........o1C22222221o.......o222222o...",
  ".....oooo..o11111111o.......o2222222o...",
  ".....oBbboo4444443333o......o4222222o...",
  ".....obbb1444443333333o....o44422223o...",
  ".....obb144443333333333o..o344433333o...",
  "......oo444333333333332o.o3344433333o...",
  "........o333333333332221o4322443333o....",
  "........o3333333332222214432224333o.....",
  "........o3333BBBBBB222214422222222o.....",
  "........o3BBBBBBBBBBBb21444222222o......",
  ".........o1111BBB111bb144444222oo.......",
  ".........oBbb1bb1BBb112244433oo.........",
  ".........obbb1bb1bbb1oooooooo...........",
  ".........oooooooooooo...................",
  "........................................",
  "........................................",
];

// Tail flame, two flicker frames; stamped at (28, 10). "." leaves the base untouched.
const FLAME = [
  [
    "....R.....",
    "...RyR....",
    "...RyR..R.",
    "..RyyR.RyR",
    "..RyyyRyyR",
    ".RyywyyyyR",
    ".RywwwyyyR",
    ".RywwwwyR.",
    ".RyywwwyR.",
    ".RyywwyyR.",
    ".RyyyyyR..",
  ],
  [
    "......R...",
    ".....RyR..",
    "..R..RyR..",
    ".RyR.RyyR.",
    ".RyyRyyyR.",
    ".RyywyyyyR",
    ".RywwwyyyR",
    ".RywwwwyR.",
    ".RyywwwyR.",
    ".RyywwyyR.",
    ".RyyyyyR..",
  ],
];

// 3×3 eye patches, stamped at (7,18) and (17,18).
const EYES: Record<string, string[]> = {
  open: [".ek", ".kk", ".kk"],
  blink: ["...", "...", ".kk"],
  happy: ["...", ".k.", "k.k"],
  closed: ["...", "k.k", ".k."],
  sleepy: ["...", ".oo", ".ek"],
};
// 4×3 mouth patches, stamped at (10,24).
const MOUTHS: Record<string, string[]> = {
  open: ["oooo", "otto", ".oo."],
  smile: ["o..o", ".oo.", "...."],
  small: ["....", ".oo.", "...."],
};

// Small icon for 40–64px slots: drawn on its own, never a shrunk copy of the big sprite.
export const ICON = [
  "...oo.........oo......",
  "..o44o.......o43o.....",
  "..o4cco.....occ3o.....",
  "..o3c3oooooo3cc2o.....",
  ".o34444444333332o..R..",
  "o3c44444433333322o.RyR",
  "o4c3ek4333333ek322oRyR",
  "o4c3kk4333333kk322oRwR",
  "occcccc3333332222o.Ryo",
  "otcccckkcc3222222o.o4o",
  ".occcccooccC2222o..o3o",
  "..occcottoC2222o..o32o",
  "...ooCCooCC222o..o322o",
  "....o2222222222oo3322o",
  "...o3333333332223332o.",
  "...o333333332222222o..",
  "...obbbbo2222obbbboo..",
  "....oooo.oooo.oooo....",
];

interface Frame { dy: number; eyes: string; mouth: string; flame: number; z: number }

function frameOf(action: PxAction, f: number): Frame {
  const flame = Math.floor(f / 2) % 2;
  switch (action) {
    case "idle":
      return { dy: Math.floor(f / 4) % 2, eyes: f % 24 === 0 ? "blink" : "open", mouth: "open", flame, z: -1 };
    case "happy":
      return { dy: [0, -2, -3, -2, 0, 0][f % 6]!, eyes: "happy", mouth: "open", flame: f % 2, z: -1 };
    case "sleepy":
      return { dy: 1, eyes: f % 16 < 2 ? "blink" : "sleepy", mouth: "small", flame: Math.floor(f / 4) % 2, z: -1 };
    case "sleep":
      return { dy: 1 + (Math.floor(f / 5) % 2), eyes: "closed", mouth: "small", flame: Math.floor(f / 6) % 2, z: Math.floor(f / 3) % 4 };
  }
}

function compose(action: PxAction, f: number): { map: string[]; fr: Frame } {
  const fr = frameOf(action, f);
  const g = BASE.map((r) => [...r]);
  const stamp = (x0: number, y0: number, rows: string[]) =>
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== ".") g[y0 + y]![x0 + x] = ch; }));
  stamp(28, 10, FLAME[fr.flame]!);
  stamp(7, 18, EYES[fr.eyes]!);
  stamp(17, 18, EYES[fr.eyes]!);
  stamp(10, 24, MOUTHS[fr.mouth]!);
  return { map: g.map((r) => r.join("")), fr };
}

function paint(ctx: CanvasRenderingContext2D, map: string[], ox: number, oy: number, silhouette: boolean) {
  map.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === ".") return;
    ctx.fillStyle = silhouette ? "#000" : PX_PALETTE[ch] ?? "#f0f";
    ctx.fillRect(ox + x, oy + y, 1, 1);
  }));
}

export function drawPixelPet(canvas: HTMLCanvasElement, spec: { action: PxAction; frame: number; silhouette?: boolean }) {
  const S = 48;
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, S, S);
  const { map, fr } = compose(spec.action, spec.frame);
  const ox = 4, oy = 2 + fr.dy;
  // ground shadow stays put while the cub hops
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  const sw = fr.dy < 0 ? 9 : 12;
  ctx.fillRect(ox + 20 - sw, 44, sw * 2, 1);
  ctx.fillRect(ox + 22 - sw, 45, sw * 2 - 4, 1);
  paint(ctx, map, ox, oy, !!spec.silhouette);
  if (fr.z >= 0 && !spec.silhouette) {
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 1 - fr.z * 0.22;
    const zx = ox + 30 + fr.z, zy = oy + 2 - fr.z * 2;
    for (const [x, y] of [[0, 0], [1, 0], [2, 0], [1, 1], [0, 2], [1, 2], [2, 2]]) ctx.fillRect(zx + x!, zy + y!, 1, 1);
    ctx.globalAlpha = 1;
  }
}

export function drawPixelIcon(canvas: HTMLCanvasElement, silhouette = false) {
  const S = 24;
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, S, S);
  paint(ctx, ICON, 1, 3, silhouette);
}
