/**
 * Scroll choreography for the landing page.
 *
 * - `[data-scene]` is a tall section whose `.stage` is pinned (position: sticky). Its progress p (0 → 1) is how far
 *   you have scrolled through it.
 * - `data-scrub="name:a,b; …"` on anything inside sets the CSS variable `--name` to 0 → 1 while p goes from a to b.
 *   CSS turns those variables into opacity and transform only, so scrolling never triggers layout.
 * - `data-steps="N"` splits a scene into N steps; the scene gets `data-step` and CSS cross-fades between them.
 * - `[data-reveal]` fades up once when it scrolls into view.
 * Reduce Motion: scenes unpin and show their end state (CSS), reveals appear without moving.
 */

const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
document.documentElement.classList.add("js");

interface Track { el: HTMLElement; vars: { name: string; a: number; b: number; last: number }[] }
interface Scene { el: HTMLElement; tracks: Track[]; steps: number; step: number; times: string[]; clock: HTMLElement | null }

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
  tracks: [...el.querySelectorAll<HTMLElement>("[data-scrub]")].map(parse),
  steps: Number(el.dataset.steps ?? 0),
  step: -1,
  times: [...el.querySelectorAll(".day-times span")].map((s) => s.textContent ?? ""),
  clock: el.querySelector<HTMLElement>("[data-watch-time]"),
}));

function setStep(s: Scene, i: number) {
  if (i === s.step) return;
  s.step = i;
  s.el.dataset.step = String(i);
  if (s.clock && s.times[i]) s.clock.textContent = s.times[i]!.replace("次日 ", "");
}

function update() {
  const vh = innerHeight;
  for (const s of scenes) {
    const r = s.el.getBoundingClientRect();
    const total = s.el.offsetHeight - vh;
    let p = total > 0 ? clamp(-r.top / total) : 1;
    if (reduce.matches && !s.steps) p = 1; // unpinned: show where the film ends
    if (r.bottom < -vh || r.top > vh * 2) { if (s.step < 0 && s.steps) setStep(s, 0); continue; } // off screen: skip
    for (const t of s.tracks) {
      for (const v of t.vars) {
        const x = Math.round(clamp((p - v.a) / (v.b - v.a)) * 1000) / 1000;
        if (x !== v.last) { v.last = x; t.el.style.setProperty(`--${v.name}`, String(x)); }
      }
    }
    if (s.steps) setStep(s, Math.min(s.steps - 1, Math.floor(p * s.steps)));
  }
  // nav: glassy once you leave the top; light text while it sits over the dark film
  const film = scenes[0]?.el.getBoundingClientRect();
  nav?.classList.toggle("scrolled", scrollY > 8);
  nav?.classList.toggle("on-dark", !!film && film.bottom > 56);
}

const nav = document.querySelector<HTMLElement>("[data-nav]");
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
const LINES = ["嘿嘿，好痒！", "今天也一起走走吧～", "我昨晚梦见在云上跑步", "（转了个圈）", "再摸一下嘛", "你今天站起来好多次！"];
const tryBtn = document.querySelector<HTMLButtonElement>("[data-try]");
const tryLine = document.querySelector<HTMLElement>("[data-try-line]");
let lineAt = -1;
let happyTimer: ReturnType<typeof setTimeout> | undefined;
tryBtn?.addEventListener("click", () => {
  lineAt = (lineAt + 1) % LINES.length;
  if (tryLine) {
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
    msg!.textContent = email ? "这个邮箱好像不太对，再看一眼？" : "先填一下邮箱";
    input.setAttribute("aria-invalid", "true");
    input.focus();
    return;
  }
  input.removeAttribute("aria-invalid");
  const btn = form.querySelector("button")!;
  btn.disabled = true;
  btn.textContent = "正在加入…";
  try {
    if (WAITLIST_ENDPOINT) {
      const r = await fetch(WAITLIST_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      if (!r.ok) throw new Error(String(r.status));
    }
    form.hidden = true;
    msg!.dataset.kind = "done";
    msg!.innerHTML = "";
    const text = document.createElement("span");
    text.textContent = `好了！上线那天给 ${email} 发一封邮件。`;
    const undo = document.createElement("button");
    undo.type = "button";
    undo.className = "link";
    undo.textContent = "改一下";
    undo.addEventListener("click", () => { form.hidden = false; msg!.textContent = ""; delete msg!.dataset.kind; input.focus(); input.select(); });
    msg!.append(text, " ", undo);
  } catch {
    msg!.dataset.kind = "error";
    msg!.textContent = "暂时没连上，过一会儿再试一次";
  } finally {
    btn.disabled = false;
    btn.textContent = "加入候补名单";
  }
});
