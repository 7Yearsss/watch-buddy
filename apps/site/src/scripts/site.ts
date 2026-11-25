/**
 * Scroll choreography for the landing page.
 *
 * - `[data-scene]` is a tall section whose `.stage` is pinned (position: sticky). Its progress p (0 → 1) is how far
 *   you have scrolled through it.
 * - `data-scrub="name:a,b; …"` on anything inside sets the CSS variable `--name` to 0 → 1 while p goes from a to b.
 *   CSS turns those variables into opacity, transform, clip-path and stroke offsets, so scrolling never triggers layout.
 * - `data-steps="N"` splits a scene into N steps; the scene gets `data-step` and CSS cross-fades between them.
 * - `[data-view]` is scrubbed the same way by its own pass through the viewport (0 = top edge enters, 1 = bottom edge leaves).
 * - `[data-reveal]` fades up once when it scrolls into view.
 * - The opening particle field is a small canvas that only runs while the opening is on screen.
 * Reduce Motion: scenes unpin and show their end state (CSS), reveals appear without moving, particles hold still.
 * Words: the page puts its language's strings in <script id="i18n" type="application/json"> (src/i18n, `client`).
 */

const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
document.documentElement.classList.add("js");

// The headline arrives word by word (character by character in Chinese, Japanese and Korean), each one coming
// into focus. Done once on load; with Reduce Motion it is simply there.
const heroTitle = document.querySelector<HTMLElement>(".hero-title");
if (heroTitle && !reduce.matches) {
  const cjk = /[぀-ヿ㐀-鿿가-힯]/;
  let w = 0;
  const walker = document.createTreeWalker(heroTitle, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    for (const tok of node.data.split(/(\s+)/)) {
      if (!tok) continue;
      if (/^\s+$/.test(tok)) { frag.append(tok); continue; }
      for (const piece of cjk.test(tok) ? [...tok] : [tok]) {
        const span = document.createElement("span");
        span.className = "w";
        span.style.setProperty("--w", String(w++));
        span.textContent = piece;
        frag.append(span);
      }
    }
    node.replaceWith(frag);
  }
}
document.documentElement.classList.add("hero-ready");

interface Strings { lines: string[]; badEmail: string; noEmail: string; joining: string; joined: string; change: string; offline: string; join: string }
const T: Strings = JSON.parse(document.getElementById("i18n")?.textContent ?? "{}");

// Picking a language by hand is remembered, so the first-visit redirect on / never overrides it.
document.querySelectorAll<HTMLAnchorElement>("[data-lang]").forEach((a) =>
  a.addEventListener("click", () => { try { localStorage.setItem("lang", a.dataset.lang!); } catch { /* private mode */ } }));

interface Track { el: HTMLElement; vars: { name: string; a: number; b: number; last: number }[] }
interface Scene { el: HTMLElement; tracks: Track[]; steps: number; step: number; times: string[]; clock: HTMLElement | null; p: number }

function parse(el: HTMLElement): Track {
  const vars = (el.dataset.scrub ?? "").split(";").map((part) => {
    const [name, range] = part.split(":").map((s) => s.trim());
    const [a, b] = (range ?? "0,1").split(",").map(Number);
    return { name: name!, a: a!, b: b!, last: -1 };
  }).filter((v) => v.name);
  return { el, vars };
}

const scenes: Scene[] = [...document.querySelectorAll<HTMLElement>("[data-scene]")].map((el) => ({
  el,
  tracks: [el, ...el.querySelectorAll<HTMLElement>("[data-scrub]")].filter((x) => x.dataset.scrub).map(parse),
  steps: Number(el.dataset.steps ?? 0),
  step: -1,
  times: [...el.querySelectorAll<HTMLElement>(".day-times [data-clock]")].map((s) => s.dataset.clock ?? ""),
  clock: el.querySelector<HTMLElement>("[data-watch-time]"),
  p: 0,
}));

function applyTracks(tracks: Track[], p: number) {
  for (const t of tracks) {
    for (const v of t.vars) {
      const x = Math.round(clamp((p - v.a) / (v.b - v.a)) * 1000) / 1000;
      if (x !== v.last) {
        v.last = x;
        t.el.style.setProperty(`--${v.name}`, String(x));
        if (v.name === "cnt") count(t.el, x);
      }
    }
  }
}

/** `data-count="N"` with a `cnt` track: the number falls from N to 1 as cnt goes 0 → 1, evenly through the
 *  orders of magnitude (19,819 → 1,000 → 100 → 10 → 1), so you can read it the whole way down. */
const numberFormat = new Intl.NumberFormat(document.documentElement.lang);
function count(el: HTMLElement, x: number) {
  const from = Number(el.dataset.count);
  el.textContent = numberFormat.format(Math.max(1, Math.round(Math.exp((1 - x) * Math.log(from)))));
}

/** `[data-view]`: scrubbed by its own pass through the viewport rather than by a pinned scene. Not used inside a scene. */
const views = [...document.querySelectorAll<HTMLElement>("[data-view]")].map((el) => ({
  el,
  tracks: [el, ...el.querySelectorAll<HTMLElement>("[data-scrub]")].filter((x) => x.dataset.scrub).map(parse),
}));

function setStep(s: Scene, i: number) {
  if (i === s.step) return;
  s.step = i;
  s.el.dataset.step = String(i);
  if (s.clock && s.times[i]) s.clock.textContent = s.times[i]!;
}

// ───── chapters and tones ─────
interface Chapter { link: HTMLAnchorElement; section: HTMLElement }
const chapterBar = document.querySelector<HTMLElement>("[data-chapters]");
const chapters: Chapter[] = [...document.querySelectorAll<HTMLAnchorElement>("[data-chapter]")]
  .map((link) => ({ link, section: document.querySelector<HTMLElement>(link.dataset.chapter!)! }))
  .filter((c) => c.section);
const toned = [...document.querySelectorAll<HTMLElement>("main > section")];
/** The tone (dark or light) of the section under a viewport y. The opening turns light once it has shrunk to a card. */
function toneAt(y: number): string {
  for (const sec of toned) {
    const r = sec.getBoundingClientRect();
    if (r.top <= y && r.bottom > y) {
      if (sec === scenes[0]?.el && !reduce.matches && (scenes[0]?.p ?? 0) > 0.95) return "light"; // Reduce Motion: no card, stays dark
      return sec.dataset.tone ?? "light";
    }
  }
  return "light";
}

// ───── opening particle field ─────
// At rest it is a nebula: a wide band of dust drifting across the whole screen, thick in places and thin in others,
// with a few loose stars around it. A mouse or pen stirs it: dust near the pointer is pushed aside and flows back.
// As you scroll (gather 0 → 1) every grain settles onto the heartbeat line, which then takes over.
class Pulse {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private ly = 0.58; // where the heartbeat line sits, as a fraction of the height (the stage's --ly)
  private pts: { u: number; off: number; a: number; b: number; s: number; v: number; star: number; sy: number; k: number }[] = [];
  private gather = 0;
  private visible = true;
  private raf = 0;
  private t0 = performance.now();
  private px = -1e4; private py = -1e4; private stir = 0; private stirTarget = 0; private lastMove = 0;
  constructor(private c: HTMLCanvasElement) {
    this.ctx = c.getContext("2d")!;
    this.resize();
    addEventListener("resize", () => this.resize());
    document.addEventListener("visibilitychange", () => this.kick());
    addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch" || reduce.matches || !this.visible) return;
      const r = this.c.getBoundingClientRect();
      this.px = e.clientX - r.left; this.py = e.clientY - r.top; this.lastMove = performance.now();
    }, { passive: true });
    this.kick();
  }
  setGather(g: number) {
    if (Math.abs(g - this.gather) < 0.001) return;
    this.gather = g;
    if (reduce.matches || !this.visible) this.draw(0);
  }
  setVisible(v: boolean) { if (v !== this.visible) { this.visible = v; this.kick(); } }
  private resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    this.w = this.c.clientWidth;
    this.h = this.c.clientHeight;
    this.c.width = Math.round(this.w * dpr);
    this.c.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ly = (parseFloat(getComputedStyle(this.c.parentElement!).getPropertyValue("--ly")) || 58) / 100;
    const n = Math.round(Math.min(11000, Math.max(3200, (this.w * this.h) / 80)));
    const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const pts = Array.from({ length: n }, () => {
      const star = Math.random() < 0.07 ? 1 : 0;
      const a = star ? 0.1 + Math.random() * 0.3 : 0.15 + Math.random() * 0.85;
      return { u: Math.random(), off: gauss(), a, b: a > 0.6 ? 2 : a > 0.35 ? 1 : 0, s: Math.random() < 0.08 ? 1.7 : 1, v: 0.6 + Math.random() * 0.8, star, sy: Math.random(), k: Math.floor(Math.random() * 3) };
    });
    pts.sort((p, q) => p.b - q.b); // grouped by brightness, so each group is one path and one fill
    this.pts = pts;
    this.draw((performance.now() - this.t0) / 1000);
  }
  private kick() {
    cancelAnimationFrame(this.raf);
    if (!this.visible || document.hidden || reduce.matches) { this.draw(0); return; }
    const loop = (now: number) => { this.draw((now - this.t0) / 1000); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  /** A heartbeat drifting slowly to the left; the same shape the line underneath ends on. */
  private wave(x: number, t: number) {
    let y = 0.22 * Math.sin(x * 7 + t * 0.5) + 0.12 * Math.sin(x * 17 - t * 0.8);
    for (let k = 0; k < 4; k++) {
      const c = (k / 4 + 0.14 - t * 0.02 + 10) % 1;
      const d = x - c;
      y += -1.5 * Math.exp(-(d * d) / 0.00005) + 0.55 * Math.exp(-((d - 0.011) ** 2) / 0.00006);
    }
    return y;
  }
  // per-frame shape of the band, sampled in columns, so each grain only looks it up
  private static COLS = 480;
  private bandT = new Float32Array(Pulse.COLS + 1);
  private widthT = new Float32Array(Pulse.COLS + 1);
  private strandT = [new Float32Array(Pulse.COLS + 1), new Float32Array(Pulse.COLS + 1), new Float32Array(Pulse.COLS + 1)];
  private lineT = new Float32Array(Pulse.COLS + 1);
  private draw(t: number) {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    const g = this.gather;
    const e = g * g * (3 - 2 * g); // ease the settle
    const cy = h * this.ly;
    const amp = h * 0.085;
    const COLS = Pulse.COLS;
    for (let c = 0; c <= COLS; c++) {
      const X = c / COLS;
      // the nebula: a band running up from bottom left to top right, swelling and thinning as it goes,
      // with three strands braided through it
      this.bandT[c] = h * (0.7 - 0.5 * X) + h * 0.07 * Math.sin(X * 5.2 + t * 0.12) + h * 0.035 * Math.sin(X * 11 - t * 0.2);
      const width = h * (0.05 + 0.09 * (0.5 + 0.5 * Math.sin(X * 6.3 + t * 0.07 + 1.3))) * (0.75 + 0.25 * Math.sin(X * 2.7 - t * 0.05));
      this.widthT[c] = width;
      for (let k = 0; k < 3; k++) this.strandT[k]![c] = (k - 1) * width * 0.9 * Math.sin(X * (3.1 + k) + t * (0.09 + 0.03 * k) + k * 2.1);
      if (e > 0) this.lineT[c] = cy + this.wave(X, t) * amp;
    }
    // the pointer's push fades in when it moves and out when it rests, so the dust never jumps
    this.stirTarget = performance.now() - this.lastMove < 1200 ? 1 : 0;
    this.stir += (this.stirTarget - this.stir) * 0.06;
    const stir = this.stir * (1 - e);
    const R = Math.max(120, Math.min(w, h) * 0.2), R2 = R * R;
    const breathe = 0.12 * Math.sin(t * 0.6);
    const alphas = [0.2, 0.45, 0.85];
    ctx.fillStyle = "#f1f2ee";
    let bucket = -1;
    for (const p of this.pts) {
      if (p.b !== bucket) {
        if (bucket >= 0) ctx.fill();
        bucket = p.b; ctx.globalAlpha = alphas[bucket]!; ctx.beginPath();
      }
      const X = (p.u + t * 0.004 * p.v) % 1;
      const c = (X * COLS) | 0;
      let px = X * w;
      const restY = p.star ? p.sy * h : this.bandT[c]! + this.strandT[p.k]![c]! + p.off * this.widthT[c]! * (p.b === 0 ? 2.4 : 0.55) * (1 + breathe);
      let py = e > 0 ? restY + (this.lineT[c]! + p.off * h * 0.003 - restY) * e : restY;
      if (stir > 0.01) {
        const dx = px - this.px, dy = py - this.py, d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          const d = Math.sqrt(d2) || 1, f = (1 - d / R) ** 2 * 38 * stir;
          px += (dx / d) * f; py += (dy / d) * f;
        }
      }
      ctx.rect(px, py, p.s, p.s);
    }
    if (bucket >= 0) ctx.fill();
    ctx.globalAlpha = 1;
  }
}
const pulseCanvas = document.querySelector<HTMLCanvasElement>("[data-pulse]");
const pulse = pulseCanvas ? new Pulse(pulseCanvas) : null;

// ───── the per-frame update ─────
const nav = document.querySelector<HTMLElement>("[data-nav]");

function update() {
  const vh = innerHeight;
  for (const s of scenes) {
    const r = s.el.getBoundingClientRect();
    const total = s.el.offsetHeight - vh;
    let p = total > 0 ? clamp(-r.top / total) : 1;
    if (reduce.matches && !s.steps) p = 1; // unpinned: show where the film ends
    s.p = p;
    if (r.bottom < -vh || r.top > vh * 2) { if (s.step < 0 && s.steps) setStep(s, 0); continue; } // far off screen: skip
    applyTracks(s.tracks, p);
    if (s.steps) setStep(s, Math.min(s.steps - 1, Math.floor(p * s.steps)));
  }
  // Unpinned pieces: progress runs from "top edge enters at the bottom" (0) to "bottom edge leaves at the top" (1).
  for (const w of views) {
    const r = w.el.getBoundingClientRect();
    if (r.bottom < -vh * 0.5 || r.top > vh * 1.5) continue;
    applyTracks(w.tracks, reduce.matches ? 1 : clamp((vh - r.top) / (vh + r.height)));
  }
  const film = scenes[0];
  pulse?.setGather(clamp(((film?.p ?? 0) - 0.02) / 0.1));
  pulse?.setVisible(!!film && film.p < 0.17 && film.el.getBoundingClientRect().bottom > 0);

  nav?.classList.toggle("scrolled", scrollY > 8);
  nav?.classList.toggle("on-dark", toneAt(30) === "dark");
  if (chapterBar) {
    chapterBar.classList.toggle("on-dark", toneAt(vh - 30) === "dark");
    chapterBar.classList.toggle("shown", scrollY > vh * 0.4);
    for (const c of chapters) {
      const r = c.section.getBoundingClientRect();
      const on = r.top <= vh * 0.5 && r.bottom > vh * 0.5;
      c.link.classList.toggle("on", on);
      if (on) c.link.style.setProperty("--cp", clamp((vh * 0.5 - r.top) / Math.max(1, r.height)).toFixed(3));
      if (on) c.link.setAttribute("aria-current", "true"); else c.link.removeAttribute("aria-current");
    }
  }
}

let queued = false;
const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; update(); }); } };
addEventListener("scroll", schedule, { passive: true });
addEventListener("resize", schedule);
reduce.addEventListener("change", schedule);
update();

// Reveal on view: once, then stop watching.
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
}, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));

// "Tap it": the pet hops, a heart floats up, it says something. Taps during the hop just restart it.
const LINES = T.lines ?? [];
const tryBtn = document.querySelector<HTMLButtonElement>("[data-try]");
const tryLine = document.querySelector<HTMLElement>("[data-try-line]");
let lineAt = -1;
let happyTimer: ReturnType<typeof setTimeout> | undefined;
tryBtn?.addEventListener("click", () => {
  lineAt = (lineAt + 1) % LINES.length;
  if (tryLine && LINES.length) {
    tryLine.textContent = LINES[lineAt]!;
    if (!reduce.matches) tryLine.animate([{ transform: "translateX(-50%) scale(.8)", opacity: 0 }, { transform: "translateX(-50%) scale(1)", opacity: 1 }], { duration: 220, easing: "cubic-bezier(.34,1.4,.64,1)" });
  }
  tryBtn.classList.add("is-happy");
  clearTimeout(happyTimer);
  happyTimer = setTimeout(() => tryBtn.classList.remove("is-happy"), 1400);
  if (reduce.matches) return;
  tryBtn.querySelector(".try-body")?.animate(
    [{ transform: "translateY(0) scale(1)" }, { transform: "translateY(4px) scale(1.06,.92)" }, { transform: "translateY(-18px) scale(.96,1.05)" }, { transform: "translateY(0) scale(1.03,.97)" }, { transform: "none" }],
    { duration: 560, easing: "cubic-bezier(.2,.8,.2,1)" },
  );
  tryBtn.querySelector(".try-heart")?.animate(
    [{ opacity: 0, transform: "translate(-50%, 0) scale(.6)" }, { opacity: 1, transform: "translate(-50%, -14px) scale(1)", offset: 0.3 }, { opacity: 0, transform: "translate(-50%, -44px) scale(.9)" }],
    { duration: 900, easing: "cubic-bezier(.2,.8,.2,1)" },
  );
});

// Waitlist. Not connected yet: apps/server will own POST /api/waitlist (docs/design/10). Until then it previews the flow.
const WAITLIST_ENDPOINT: string | null = null;
const form = document.querySelector<HTMLFormElement>("[data-join]");
const msg = document.querySelector<HTMLElement>("[data-join-msg]");
form?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const input = form.querySelector("input")!;
  const email = input.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    msg!.dataset.kind = "error";
    msg!.textContent = email ? T.badEmail : T.noEmail;
    input.setAttribute("aria-invalid", "true");
    input.focus();
    return;
  }
  input.removeAttribute("aria-invalid");
  const btn = form.querySelector("button")!;
  btn.disabled = true;
  btn.textContent = T.joining;
  try {
    if (WAITLIST_ENDPOINT) {
      const r = await fetch(WAITLIST_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      if (!r.ok) throw new Error(String(r.status));
    }
    form.hidden = true;
    msg!.dataset.kind = "done";
    msg!.innerHTML = "";
    const text = document.createElement("span");
    text.textContent = T.joined.replace("{email}", email);
    const undo = document.createElement("button");
    undo.type = "button";
    undo.className = "link";
    undo.textContent = T.change;
    undo.addEventListener("click", () => { form.hidden = false; msg!.textContent = ""; delete msg!.dataset.kind; input.focus(); input.select(); });
    msg!.append(text, " ", undo);
  } catch {
    msg!.dataset.kind = "error";
    msg!.textContent = T.offline;
  } finally {
    btn.disabled = false;
    btn.textContent = T.join;
  }
});

// ───── pets that notice you ─────
// They breathe and blink on their own (CSS). Their eyes follow a mouse or pen; with no pointer around
// (phones, or a mouse left still) they glance about now and then. Reduce Motion: eyes stay put.
const lookers = [...document.querySelectorAll<SVGGElement>(".pet-look")].map((g) => g.ownerSVGElement!).filter(Boolean);
const inView = new Set<Element>();
const lookIO = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) inView.add(e.target); else inView.delete(e.target);
});
lookers.forEach((svg) => lookIO.observe(svg));
let pointerX = 0, pointerY = 0, lastPointer = -Infinity, lookQueued = false;
function setLook(svg: SVGSVGElement, x: number, y: number) {
  svg.style.setProperty("--lx", x.toFixed(2));
  svg.style.setProperty("--ly", y.toFixed(2));
}
function lookAtPointer() {
  lookQueued = false;
  for (const svg of lookers) {
    if (!inView.has(svg)) continue;
    const r = svg.getBoundingClientRect();
    const dx = pointerX - (r.left + r.width / 2), dy = pointerY - (r.top + r.height * 0.62); // the eyes sit low in the body
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / 240); // close by, it looks only a little off centre
    setLook(svg, (dx / d) * k, (dy / d) * k);
  }
}
addEventListener("pointermove", (e) => {
  if (e.pointerType === "touch" || reduce.matches) return;
  pointerX = e.clientX; pointerY = e.clientY; lastPointer = performance.now();
  if (!lookQueued) { lookQueued = true; requestAnimationFrame(lookAtPointer); }
}, { passive: true });
setInterval(() => {
  if (reduce.matches || document.hidden || performance.now() - lastPointer < 4000) return;
  for (const svg of lookers) {
    if (!inView.has(svg)) continue;
    if (Math.random() < 0.45) setLook(svg, Math.random() * 1.6 - 0.8, Math.random() * 0.9 - 0.45);
    else setLook(svg, 0, 0);
  }
}, 2400);
