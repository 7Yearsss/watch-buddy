import { drawSprite, type SpriteAction } from "./sprites";
import { drawCute, type CuteAction, type CuteElement } from "./cute";
import { drawPixelIcon, drawPixelPet } from "./pixelpet";
import { mountVectorPet } from "./vectorpet";

const ACTIONS: [CuteAction, string][] = [["idle", "待机"], ["happy", "开心"], ["sleepy", "困"], ["sleep", "睡着"]];
const ELEMENTS: [CuteElement, string][] = [["fire", "火"], ["water", "水"], ["grass", "草"]];
const SLOTS = [64, 40];

let action: CuteAction = "idle";
let element: CuteElement = "fire";
let silhouette = false;
let frame = 0;

function seg<T extends string>(id: string, items: [T, string][], get: () => T, onPick: (v: T) => void) {
  const el = document.getElementById(id)!;
  const render = () => {
    el.innerHTML = "";
    for (const [v, label] of items) {
      const b = document.createElement("button");
      b.textContent = label;
      b.setAttribute("aria-pressed", String(get() === v));
      b.onclick = () => { onPick(v); frame = 0; render(); draw(); };
      el.append(b);
    }
  };
  render();
}
seg("action", ACTIONS, () => action, (v) => (action = v));
seg("element", ELEMENTS, () => element, (v) => (element = v));
(document.getElementById("sil") as HTMLInputElement).onchange = (e) => { silhouette = (e.target as HTMLInputElement).checked; draw(); };

/**
 * Size a canvas so each art pixel covers a whole number of device pixels (never fractional, never shrunk below
 * 1×), the largest that fits in `slot` CSS pixels. Fractional scales are what made the earlier page look blurry.
 */
function fit(c: HTMLCanvasElement, art: number, slot: number) {
  const dpr = window.devicePixelRatio || 1;
  const n = Math.max(1, Math.floor((slot * dpr) / art));
  c.style.width = c.style.height = `${(art * n) / dpr}px`;
}

function sizeRow(id: string) {
  const row = document.getElementById(id)!;
  return SLOTS.map((px) => {
    const wrap = document.createElement("div");
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.style.width = chip.style.height = `${px + 12}px`;
    const c = document.createElement("canvas");
    chip.append(c);
    const cap = document.createElement("span");
    cap.textContent = `${px}px`;
    wrap.append(chip, cap);
    row.append(wrap);
    return { c, px };
  });
}
const big = (id: string) => ({ c: document.getElementById(id) as HTMLCanvasElement, px: 192 });
const oldCanvases = [big("old-big"), ...sizeRow("old-sizes")];
const cuteCanvases = [big("cute-big"), ...sizeRow("cute-sizes")];
const pxCanvases = [big("px-big"), ...sizeRow("px-sizes")];

const vecHosts = [document.getElementById("vec-big")!, ...SLOTS.map((px) => {
  const wrap = document.createElement("div");
  const chip = document.createElement("div");
  chip.className = "chip";
  chip.style.width = chip.style.height = `${px + 12}px`;
  const h = document.createElement("div");
  h.style.width = h.style.height = `${px}px`;
  chip.append(h);
  const cap = document.createElement("span");
  cap.textContent = `${px}px`;
  wrap.append(chip, cap);
  document.getElementById("vec-sizes")!.append(wrap);
  return h;
})];

const OLD_ACTION: Record<CuteAction, SpriteAction> = { idle: "idle", happy: "happy", sleepy: "sleepy", sleep: "sleep" };

function blackout(c: HTMLCanvasElement) {
  const ctx = c.getContext("2d")!;
  ctx.save();
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.restore();
}

function draw() {
  for (const { c, px } of oldCanvases) {
    drawSprite(c, { primary: element, stage: "baby", action: OLD_ACTION[action], frame });
    if (silhouette) blackout(c);
    fit(c, 48, px);
  }
  for (const { c, px } of cuteCanvases) { drawCute(c, { element, action, frame, silhouette }); fit(c, 48, px); }
  pxCanvases.forEach(({ c, px }, i) => {
    if (i === 0) { drawPixelPet(c, { action, frame, silhouette }); fit(c, 48, px); }
    else { drawPixelIcon(c, silhouette); fit(c, 24, px); }
  });
  for (const h of vecHosts) {
    mountVectorPet(h, action);
    h.style.filter = silhouette ? "brightness(0)" : "";
  }
  // black-on-black is invisible, so lighten the screen in silhouette mode
  document.querySelectorAll<HTMLElement>(".watch, .chip").forEach((el) => (el.style.background = silhouette ? "#fff" : "#000"));
}

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
draw();
addEventListener("resize", draw);
if (!reduce) setInterval(() => { frame++; draw(); }, 160);
