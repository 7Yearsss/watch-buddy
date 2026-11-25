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
      if (x !== v.last) { v.last = x; t.el.style.setProperty(`--${v.name}`, String(x)); }
    }
  }
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
class Pulse {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private pts: { u: number; off: number; a: number; s: number; v: number }[] = [];
  private gather = 0;
  private visible = true;
  private raf = 0;
  private t0 = performance.now();
  constructor(private c: HTMLCanvasElement) {
    this.ctx = c.getContext("2d")!;
    this.resize();
    addEventListener("resize", () => this.resize());
    document.addEventListener("visibilitychange", () => this.kick());
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
    const n = Math.round(Math.min(2400, Math.max(900, (this.w * this.h) / 520)));
    const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    this.pts = Array.from({ length: n }, () => ({ u: Math.random(), off: gauss(), a: 0.18 + Math.random() * 0.7, s: Math.random() < 0.12 ? 2 : 1.2, v: 0.6 + Math.random() * 0.8 }));
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
  private draw(t: number) {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    const g = this.gather;
    const cy = h * 0.42;
    const amp = h * 0.085;
    const spread = h * 0.2 * (1 - g) * (1 - g);
    const alphas = [0.25, 0.5, 0.85];
    ctx.fillStyle = "#f1f2ee";
    // three alpha buckets: one globalAlpha change per bucket instead of per point
    for (let b = 0; b < 3; b++) {
      ctx.globalAlpha = alphas[b]!;
      for (const p of this.pts) {
        const bucket = p.a > 0.6 ? 2 : p.a > 0.35 ? 1 : 0;
        if (bucket !== b) continue;
        const x = ((p.u + t * 0.004 * p.v) % 1) * w;
        const breathe = 1 + 0.15 * Math.sin(t * 0.7 + p.u * 9);
        ctx.fillRect(x, cy + this.wave(x / w, t) * amp + p.off * spread * breathe, p.s, p.s);
      }
    }
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
