import { CONCEPTS, type Concept } from "./concepts";
import { mountVectorPet } from "./vectorpet";

// The red panda reuses vectorpet's SVG, which needs its stylesheet; mounting once injects it.
mountVectorPet(document.createElement("div"), "idle");

const ELEMENT_LABEL = { fire: "火", water: "水", grass: "草" } as const;
let uidSeq = 0;
const render = (c: Concept) => c.svg(`${c.id}-${uidSeq++}`);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function current(): Concept {
  const id = decodeURIComponent(location.hash.slice(1));
  return CONCEPTS.find((c) => c.id === id) ?? CONCEPTS[0]!;
}

function buildSheet() {
  const sheet = $("sheet");
  sheet.innerHTML = "";
  for (const c of CONCEPTS) {
    const b = document.createElement("button");
    b.className = "tile";
    b.dataset.id = c.id;
    b.innerHTML = `<div class="art"><div class="main">${render(c)}</div><div class="sil">${render(c)}</div></div>
      <b>${c.name}<span class="tag ${c.element}">${ELEMENT_LABEL[c.element]}</span></b><small>${c.animal}</small>`;
    b.onclick = () => { location.hash = c.id; };
    sheet.append(b);
  }
}

function buildGrid() {
  let g = "";
  for (let i = 10; i < 200; i += 10) {
    const major = i % 50 === 0;
    const s = major ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.12)";
    g += `<line x1="${i}" y1="0" x2="${i}" y2="200" stroke="${s}" stroke-width=".4"/><line x1="0" y1="${i}" x2="200" y2="${i}" stroke="${s}" stroke-width=".4"/>`;
    if (major) g += `<text x="${i + 1}" y="6" font-size="5" fill="rgba(255,255,255,.6)">${i}</text><text x="1" y="${i - 1}" font-size="5" fill="rgba(255,255,255,.6)">${i}</text>`;
  }
  $("grid").innerHTML = g;
}

function showBench() {
  const c = current();
  document.querySelectorAll<HTMLElement>(".tile").forEach((t) => t.setAttribute("aria-current", String(t.dataset.id === c.id)));
  $("bench-title").textContent = `工作台 · ${c.name}`;
  $("art").innerHTML = render(c);
  $("info").innerHTML = `<b>${c.name}</b><span class="tag ${c.element}">${ELEMENT_LABEL[c.element]}</span> · ${c.animal}<div class="muted">${c.signature}</div>`;
  const sizes = $("sizes");
  sizes.innerHTML = "";
  for (const [px, label, cls] of [[120, "剪影", "chip light sil"], [96, "手表主屏约 96pt", "chip"], [64, "Smart Stack 64px", "chip"], [40, "表盘复杂功能 40px", "chip"]] as const) {
    const w = document.createElement("div");
    w.innerHTML = `<div class="${cls}" style="width:${px + 12}px;height:${px + 12}px"><div class="${cls.includes("sil") ? "sil-art" : ""}" style="width:${px}px;height:${px}px">${render(c)}</div></div><div class="cap">${label}</div>`;
    sizes.append(w);
  }
}

// reference underlay for tracing
const ref = $<HTMLImageElement>("ref");
const setRef = (src: string) => { ref.src = src; ref.hidden = !src; };
$<HTMLInputElement>("ref-url").onchange = (e) => setRef((e.target as HTMLInputElement).value.trim());
$<HTMLInputElement>("ref-file").onchange = (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) setRef(URL.createObjectURL(f));
};
const op = $<HTMLInputElement>("ref-op");
const applyOp = () => { ref.style.opacity = String(+op.value / 100); };
op.oninput = applyOp;
applyOp();
$<HTMLInputElement>("show-grid").onchange = (e) => { $("grid").style.display = (e.target as HTMLInputElement).checked ? "" : "none"; };

buildSheet();
buildGrid();
showBench();
addEventListener("hashchange", showBench);
