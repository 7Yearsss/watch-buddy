import { drawSprite, PALETTES, type SpriteSpec } from "./sprites";
import type { ElementType } from "@pulseling/engine";

/**
 * Share card, 1080×1920 (9:16, the Stories size, so nobody has to crop). One big "flex" line, the pet large,
 * the app name in a corner. Health numbers stay off the card unless the player turns them on.
 */
export interface ShareCard {
  spec: Omit<SpriteSpec, "frame">;
  kicker: string;
  flex: string;
  lines: string[];
  /** Optional health line, only drawn when the player opts in. */
  privateLine?: string;
}

const W = 1080, H = 1920;
const FONT = '"Fusion Pixel 12px Proportional SC", monospace';

export async function renderShareCard(canvas: HTMLCanvasElement, card: ShareCard, includePrivate: boolean) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  await document.fonts.load(`48px ${FONT}`);
  const pal = PALETTES[card.spec.primary as ElementType];

  // banded pixel gradient background in the pet's type colours
  const bands = [pal.dark, pal.main, pal.light, pal.belly];
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = bands[Math.min(bands.length - 1, Math.floor((i / 24) * bands.length))]!;
    ctx.fillRect(0, (H / 24) * i, W, H / 24 + 1);
  }
  ctx.fillStyle = "rgba(0,0,0,.18)";
  ctx.fillRect(0, 0, W, H);

  // pet, big and crisp
  const sprite = document.createElement("canvas");
  drawSprite(sprite, { ...card.spec, frame: 1, action: "happy" });
  ctx.imageSmoothingEnabled = false;
  const size = 48 * 15;
  ctx.drawImage(sprite, (W - size) / 2, 470, size, size);

  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0,0,0,.35)";
  ctx.shadowOffsetY = 6;
  ctx.font = `44px ${FONT}`;
  ctx.fillText(card.kicker, W / 2, 230);
  ctx.font = `96px ${FONT}`;
  wrap(ctx, card.flex, W / 2, 360, W - 140, 110);
  // dark panel so the lines stay readable on the light bands
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "rgba(0,0,0,.38)";
  const panelH = card.lines.length * 80 + (includePrivate && card.privateLine ? 160 : 80);
  ctx.fillRect(70, 1220, W - 140, panelH);
  ctx.shadowColor = "rgba(0,0,0,.35)";
  ctx.fillStyle = "#fff";
  ctx.font = `48px ${FONT}`;
  card.lines.forEach((l, i) => ctx.fillText(l, W / 2, 1300 + i * 80));
  if (includePrivate && card.privateLine) {
    ctx.font = `40px ${FONT}`;
    ctx.fillStyle = "#fff6c8";
    ctx.fillText(card.privateLine, W / 2, 1300 + card.lines.length * 80 + 40);
  }
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.font = `40px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText("Pulseling · 跟着你的健康长大", W - 60, H - 70);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number) {
  let line = "";
  let yy = y;
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > max && line) {
      ctx.fillText(line, x, yy);
      line = ch;
      yy += lh;
    } else line += ch;
  }
  ctx.fillText(line, x, yy);
}
