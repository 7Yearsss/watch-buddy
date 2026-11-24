/**
 * Patch the live DOM to match new HTML instead of replacing it, so a re-render keeps what the user is in the middle
 * of: running animations and transitions, focus, scroll position, an open <details>, a dragged slider.
 *
 * - Children match by position and tag; give an element `data-key` when it must be a *new* element whenever the key
 *   changes (a new speech bubble, the next replay hit), so its entrance animation plays again.
 * - An element with `data-exit` leaves with its `.leaving` animation instead of vanishing.
 * - `data-num` on an element rolls its number from the old value to the new one.
 * - `data-keep-style` keeps a style that script drives every frame (the charge gauge marker).
 */

let reduced = () => false;
export const setMorphReducedMotion = (fn: () => boolean) => { reduced = fn; };

export function morph(root: Element, html: string) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  patchChildren(root, tpl.content);
}

const keyOf = (n: Node) => (n instanceof Element ? n.getAttribute("data-key") : null);
const isLeaving = (n: Node | null) => n instanceof Element && n.hasAttribute("data-leaving");
const live = (n: Node | null): Node | null => { while (n && isLeaving(n)) n = n.nextSibling; return n; };
const same = (a: Node, b: Node) =>
  a.nodeType === b.nodeType && (!(a instanceof Element) || (a.tagName === (b as Element).tagName && keyOf(a) === keyOf(b)));

function patchChildren(parent: Node, next: ParentNode) {
  let cur = live(parent.firstChild);
  for (const nk of Array.from(next.childNodes)) {
    let match: Node | null = cur && same(cur, nk) ? cur : null;
    if (!match && keyOf(nk) !== null) {
      for (let n = cur; n; n = n.nextSibling) if (!isLeaving(n) && same(n, nk)) { match = n; break; }
    }
    if (match) {
      if (match !== cur) parent.insertBefore(match, cur);
      patch(match, nk);
      cur = live(match.nextSibling);
    } else {
      parent.insertBefore(nk, cur);
    }
  }
  while (cur) {
    const after = live(cur.nextSibling);
    leave(cur);
    cur = after;
  }
}

function leave(n: Node) {
  if (!(n instanceof HTMLElement) || !n.hasAttribute("data-exit")) return n.parentNode?.removeChild(n);
  n.setAttribute("data-leaving", "");
  n.classList.add("leaving");
  n.setAttribute("aria-hidden", "true");
  const done = () => n.remove();
  n.addEventListener("animationend", done, { once: true });
  setTimeout(done, 400); // no animation (Reduce Motion) or interrupted: still go
}

function patch(old: Node, nu: Node) {
  if (!(old instanceof Element) || !(nu instanceof Element)) {
    if (old.nodeValue !== nu.nodeValue) old.nodeValue = nu.nodeValue;
    return;
  }
  syncAttributes(old, nu);
  if (old.hasAttribute("data-num") && rollNumber(old as HTMLElement, nu.textContent ?? "")) return;
  patchChildren(old, nu);
}

function syncAttributes(old: Element, nu: Element) {
  const keepStyle = old.hasAttribute("data-keep-style");
  for (const { name } of Array.from(old.attributes)) {
    if (nu.hasAttribute(name)) continue;
    if (name === "style" && keepStyle) continue;
    if (name === "open" && old.tagName === "DETAILS") continue; // the user opened it
    if ((name === "width" || name === "height") && old.tagName === "CANVAS") continue; // set by drawing
    if (name === "data-leaving") continue;
    old.removeAttribute(name);
  }
  for (const { name, value } of Array.from(nu.attributes)) {
    if (name === "style" && keepStyle) continue;
    if (old.getAttribute(name) !== value) old.setAttribute(name, value);
  }
  if (old instanceof HTMLInputElement) {
    const n = nu as HTMLInputElement;
    if (old.checked !== n.hasAttribute("checked")) old.checked = n.hasAttribute("checked");
    const v = n.getAttribute("value");
    if (v !== null && old.value !== v && document.activeElement !== old) old.value = v;
  }
}

const NUM = /-?\d[\d,]*(\.\d+)?/;
const tweens = new WeakMap<HTMLElement, number>();

/** Count from the shown number to the new one (≈ 400 ms, eased). Returns false when the text isn't a number change. */
function rollNumber(el: HTMLElement, to: string): boolean {
  const from = el.textContent ?? "";
  if (from === to) return true;
  const a = from.match(NUM), b = to.match(NUM);
  const fa = a ? Number(a[0].replace(/,/g, "")) : NaN, fb = b ? Number(b[0].replace(/,/g, "")) : NaN;
  const sameShape = a && b && from.replace(NUM, "#") === to.replace(NUM, "#");
  cancelAnimationFrame(tweens.get(el) ?? 0);
  if (!sameShape || !Number.isFinite(fa) || !Number.isFinite(fb) || reduced() || Math.abs(fb - fa) < 1) {
    el.textContent = to;
    return true;
  }
  const decimals = b![1] ? b![1].length - 1 : 0;
  const grouped = b![0].includes(",");
  const start = performance.now();
  const dur = 420;
  const step = (now: number) => {
    const p = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    const v = fa + (fb - fa) * e;
    const s = grouped ? Math.round(v).toLocaleString("en-US") : v.toFixed(decimals);
    el.textContent = p >= 1 ? to : to.replace(NUM, s);
    if (p < 1) tweens.set(el, requestAnimationFrame(step));
  };
  tweens.set(el, requestAnimationFrame(step));
  return true;
}
