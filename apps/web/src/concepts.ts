/**
 * Concept sheet: original starter-pet ideas drawn as SVG in one shared style. Each follows the pattern that
 * Pokémon starters use (a familiar animal + one element motif + one silhouette feature that sticks out), but the
 * animals and motifs are our own. viewBox is 0 0 200 200 with the ground at y≈186.
 */
import { SVG as RED_PANDA } from "./vectorpet";

export type Element = "fire" | "water" | "grass";

export interface Concept {
  id: string;
  name: string;
  element: Element;
  animal: string;
  signature: string;
  svg: (uid: string) => string;
}

interface Pal { line: string; hi: string; mid: string; lo: string; cream: string; creamLo: string }
const FIRE: Pal = { line: "#5a2016", hi: "#ffb06a", mid: "#ef7038", lo: "#c2412d", cream: "#fff7e8", creamLo: "#f3d2ad" };
const WATER: Pal = { line: "#173a5c", hi: "#bfe3ff", mid: "#6fb0e6", lo: "#3a78b8", cream: "#f2fbff", creamLo: "#c9e6f7" };
const GRASS: Pal = { line: "#24421f", hi: "#c9ef9a", mid: "#86c95e", lo: "#4f9442", cream: "#fbfde9", creamLo: "#dbe9b8" };
const INK = "#24120e";

/** Shared gradients: <uid>-body (radial, lit up-left), <uid>-cream, <uid>-flame, <uid>-dark. */
function defs(uid: string, p: Pal) {
  return `<defs>
    <radialGradient id="${uid}-body" cx="32%" cy="26%" r="85%"><stop offset="0" stop-color="${p.hi}"/><stop offset=".5" stop-color="${p.mid}"/><stop offset="1" stop-color="${p.lo}"/></radialGradient>
    <linearGradient id="${uid}-cream" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.cream}"/><stop offset="1" stop-color="${p.creamLo}"/></linearGradient>
    <linearGradient id="${uid}-flame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff6a2a"/><stop offset=".55" stop-color="#ffb53a"/><stop offset="1" stop-color="#ffe27a"/></linearGradient>
    <radialGradient id="${uid}-ember" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff1a8"/><stop offset=".5" stop-color="#ffb23a"/><stop offset="1" stop-color="#ff6a2a"/></radialGradient>
    <linearGradient id="${uid}-dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a3a2c"/><stop offset="1" stop-color="#3f1d18"/></linearGradient>
    <radialGradient id="${uid}-leaf" cx="30%" cy="30%" r="80%"><stop offset="0" stop-color="#d8f5a0"/><stop offset=".6" stop-color="#7cc456"/><stop offset="1" stop-color="#3f8a3a"/></radialGradient>
    <radialGradient id="${uid}-water" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#f4fdff"/><stop offset=".55" stop-color="#9fdcff"/><stop offset="1" stop-color="#4aa3e8"/></radialGradient>
  </defs>`;
}
const wrap = (inner: string) => `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
const shadow = (cx = 100, rx = 56) => `<ellipse cx="${cx}" cy="187" rx="${rx}" ry="6.5" fill="rgba(0,0,0,.26)"/>`;
/** Glossy cartoon eye: dark oval, big catch-light up-left, small one down-right. */
const eye = (cx: number, cy: number, rx = 6.5, ry = 8.5) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${INK}"/><circle cx="${cx - rx * 0.36}" cy="${cy - ry * 0.42}" r="${rx * 0.4}" fill="#fff"/><circle cx="${cx + rx * 0.35}" cy="${cy + ry * 0.45}" r="${rx * 0.17}" fill="#fff" opacity=".85"/>`;
const blush = (cx: number, cy: number, rx = 7) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${rx * 0.55}" fill="#ff7f86" opacity=".5"/>`;
const openMouth = (x: number, y: number, w = 14) =>
  `<path d="M${x - w / 2} ${y} Q${x} ${y + 4} ${x + w / 2} ${y} Q${x + w / 2 - 1} ${y + w * 0.8} ${x} ${y + w * 0.85} Q${x - w / 2 + 1} ${y + w * 0.8} ${x - w / 2} ${y} Z" fill="#5a1a14"/><path d="M${x - w * 0.3} ${y + w * 0.55} Q${x} ${y + w * 0.3} ${x + w * 0.3} ${y + w * 0.55} Q${x} ${y + w * 0.85} ${x - w * 0.3} ${y + w * 0.55} Z" fill="#ff7f86"/>`;
const smile = (x: number, y: number, w = 10, c = "#5a1a14") => `<path d="M${x - w / 2} ${y} Q${x - w / 4} ${y + w * 0.45} ${x} ${y} Q${x + w / 4} ${y + w * 0.45} ${x + w / 2} ${y}" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
/** Union of circles with one clean outer outline: stroke pass under a fill pass. */
const blob = (circles: [number, number, number][], fill: string, line: string, w = 3.2) =>
  circles.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${line}" stroke="${line}" stroke-width="${w * 2}"/>`).join("") +
  circles.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`).join("");

export const CONCEPTS: Concept[] = [
  // ---------------- fire ----------------
  {
    id: "ember-panda", name: "焰尾小熊猫", element: "fire", animal: "小熊猫",
    signature: "卷起来的环纹大尾巴，尾巴尖是一团火；举爪打招呼",
    svg: () => RED_PANDA,
  },
  {
    id: "coal-lamb", name: "炭绒羊", element: "fire", animal: "小绵羊",
    signature: "头顶一团像篝火一样发光的卷毛；羊毛里藏着火星",
    svg: (u) => wrap(`${defs(u, FIRE)}${shadow(102, 60)}
      ${[74, 94, 116, 136].map((x) => `<rect x="${x - 7}" y="160" width="14" height="26" rx="7" fill="url(#${u}-dark)" stroke="${FIRE.line}" stroke-width="3"/>`).join("")}
      ${blob([[72, 132, 30], [102, 118, 34], [136, 128, 30], [88, 152, 26], [122, 152, 26], [150, 146, 18]], `url(#${u}-cream)`, FIRE.line)}
      ${[[108, 104], [134, 118], [96, 140], [128, 148], [146, 136]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="url(#${u}-ember)"/>`).join("")}
      <ellipse cx="46" cy="98" rx="13" ry="6.5" transform="rotate(28 46 98)" fill="#c85a3a" stroke="${FIRE.line}" stroke-width="3"/>
      <ellipse cx="78" cy="98" rx="31" ry="27" fill="url(#${u}-body)" stroke="${FIRE.line}" stroke-width="3.2"/>
      <ellipse cx="70" cy="112" rx="17" ry="11" fill="#ffd0a8"/>
      ${blob([[64, 70, 13], [80, 64, 15], [96, 72, 12]], `url(#${u}-flame)`, "#c2361c", 2.8)}
      <circle cx="80" cy="68" r="6" fill="#fff4b8"/>
      ${eye(66, 96, 5.6, 7)}${eye(92, 94, 5, 6.6)}
      <path d="M66 106 Q70 104 74 106 Q72 110 70 110 Q68 110 66 106 Z" fill="${INK}"/>
      ${openMouth(70, 114, 11)}
      ${blush(52, 108, 6)}${blush(100, 106, 5)}`),
  },
  {
    id: "ember-hamster", name: "暖颊仓鼠", element: "fire", animal: "仓鼠",
    signature: "两颊的颊囊像炭火一样发光；双手捧着一颗火种",
    svg: (u) => wrap(`${defs(u, FIRE)}${shadow(100, 52)}
      <circle cx="62" cy="80" r="14" fill="url(#${u}-body)" stroke="${FIRE.line}" stroke-width="3.2"/><circle cx="62" cy="81" r="7" fill="#ffb4a0"/>
      <circle cx="138" cy="80" r="14" fill="url(#${u}-body)" stroke="${FIRE.line}" stroke-width="3.2"/><circle cx="138" cy="81" r="7" fill="#ffb4a0"/>
      <ellipse cx="78" cy="182" rx="14" ry="7" fill="#ffcfb0" stroke="${FIRE.line}" stroke-width="3"/>
      <ellipse cx="122" cy="182" rx="14" ry="7" fill="#ffcfb0" stroke="${FIRE.line}" stroke-width="3"/>
      <ellipse cx="100" cy="128" rx="60" ry="54" fill="url(#${u}-body)" stroke="${FIRE.line}" stroke-width="3.2"/>
      <ellipse cx="100" cy="150" rx="36" ry="30" fill="url(#${u}-cream)"/>
      <ellipse cx="56" cy="126" rx="19" ry="15" fill="url(#${u}-ember)" opacity=".95"/>
      <ellipse cx="144" cy="126" rx="19" ry="15" fill="url(#${u}-ember)" opacity=".95"/>
      ${eye(80, 110)}${eye(120, 110)}
      <ellipse cx="100" cy="121" rx="4.5" ry="3.2" fill="#e5606a"/>
      ${smile(100, 126, 12)}
      <path d="M100 132 C93 138 92 146 100 152 C108 146 107 138 100 132 Z" fill="url(#${u}-flame)" stroke="#c2361c" stroke-width="2.4"/>
      <ellipse cx="89" cy="150" rx="8" ry="7" fill="#ffcfb0" stroke="${FIRE.line}" stroke-width="2.8"/>
      <ellipse cx="111" cy="150" rx="8" ry="7" fill="#ffcfb0" stroke="${FIRE.line}" stroke-width="2.8"/>`),
  },
  // ---------------- water ----------------
  {
    id: "spout-narwhal", name: "泉角独角鲸", element: "water", animal: "独角鲸宝宝",
    signature: "额头的角是一股向上旋转的水柱，角尖冒水珠；尾鳍翘起",
    svg: (u) => wrap(`${defs(u, WATER)}${shadow(104, 62)}
      <path d="M150 140 C162 128 166 112 160 96 C172 100 184 92 188 82 C188 100 178 116 164 122 C170 130 168 140 160 146 Z" fill="url(#${u}-body)" stroke="${WATER.line}" stroke-width="3.2" stroke-linejoin="round"/>
      <path d="M40 140 C40 108 70 92 104 94 C140 96 164 116 162 146 C160 174 132 184 100 184 C66 184 40 170 40 140 Z" fill="url(#${u}-body)" stroke="${WATER.line}" stroke-width="3.2"/>
      <path d="M52 156 C70 176 128 180 150 160 C140 178 120 184 100 184 C74 184 58 174 52 156 Z" fill="url(#${u}-cream)"/>
      ${[[118, 108, 5], [134, 116, 4], [110, 120, 3.5], [146, 128, 3]].map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r! * 0.8}" fill="${WATER.lo}" opacity=".55"/>`).join("")}
      <ellipse cx="92" cy="170" rx="16" ry="7" transform="rotate(-20 92 170)" fill="url(#${u}-body)" stroke="${WATER.line}" stroke-width="3"/>
      <path d="M66 100 C60 82 58 62 62 40 C70 60 78 80 80 98 Z" fill="url(#${u}-water)" stroke="${WATER.line}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M64 88 L77 84 M62 74 L74 70 M62 60 L70 56" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".9"/>
      <circle cx="56" cy="30" r="4.5" fill="url(#${u}-water)" stroke="${WATER.line}" stroke-width="2"/><circle cx="70" cy="26" r="3.2" fill="url(#${u}-water)" stroke="${WATER.line}" stroke-width="2"/><circle cx="62" cy="18" r="2.4" fill="url(#${u}-water)" stroke="${WATER.line}" stroke-width="1.8"/>
      ${eye(72, 128, 6.4, 8.2)}${eye(104, 126, 5.8, 7.6)}
      ${openMouth(86, 142, 12)}
      ${blush(60, 140)}${blush(116, 138, 6)}`),
  },
  {
    id: "lily-capybara", name: "睡莲水豚", element: "water", animal: "水豚（卡皮巴拉）",
    signature: "头顶顶着一片睡莲叶和一颗水珠；永远一副很放松的眯眼表情",
    svg: (u) => wrap(`${defs(u, WATER)}${shadow(108, 64)}
      <ellipse cx="128" cy="140" rx="54" ry="40" fill="url(#${u}-body)" stroke="${WATER.line}" stroke-width="3.2"/>
      ${[[96, 176], [156, 176]].map(([x, y]) => `<rect x="${x! - 8}" y="${y! - 12}" width="16" height="22" rx="7" fill="${WATER.lo}" stroke="${WATER.line}" stroke-width="3"/>`).join("")}
      <ellipse cx="100" cy="76" rx="8" ry="6" fill="${WATER.lo}" stroke="${WATER.line}" stroke-width="3"/>
      <path d="M30 112 C30 88 50 72 80 72 C108 72 124 90 122 116 C120 140 102 150 78 150 C50 150 30 136 30 112 Z" fill="url(#${u}-body)" stroke="${WATER.line}" stroke-width="3.2"/>
      <path d="M30 116 C30 104 38 96 50 96 C58 96 62 104 62 116 C62 130 54 138 44 138 C34 138 30 128 30 116 Z" fill="url(#${u}-cream)"/>
      <ellipse cx="40" cy="108" rx="7" ry="5" fill="${INK}"/>
      <path d="M62 66 C70 56 98 54 110 64 C104 70 96 68 92 74 C82 70 70 72 62 66 Z" fill="url(#${u}-leaf)" stroke="#24421f" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M84 60 C80 50 84 44 88 40 C92 44 96 50 92 60 Z" fill="#ffd6e6" stroke="#b44c7a" stroke-width="2"/>
      <circle cx="104" cy="50" r="5" fill="url(#${u}-water)" stroke="${WATER.line}" stroke-width="2"/>
      <path d="M62 102 Q68 98 74 102" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M90 100 Q95 96 100 100" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>
      ${smile(44, 126, 10, WATER.line)}
      ${blush(70, 116, 7)}${blush(104, 114, 6)}`),
  },
  {
    id: "float-manatee", name: "泳圈海牛", element: "water", animal: "海牛宝宝",
    signature: "腰上套着一个水做的泳圈；胖胖的大鼻子带胡须点",
    svg: (u) => wrap(`${defs(u, WATER)}${shadow(100, 46)}
      <ellipse cx="100" cy="182" rx="30" ry="9" fill="url(#${u}-body)" stroke="${WATER.line}" stroke-width="3"/>
      <path d="M100 52 C134 52 150 84 150 124 C150 158 130 178 100 178 C70 178 50 158 50 124 C50 84 66 52 100 52 Z" fill="url(#${u}-body)" stroke="${WATER.line}" stroke-width="3.2"/>
      <ellipse cx="100" cy="146" rx="30" ry="26" fill="url(#${u}-cream)"/>
      <ellipse cx="96" cy="108" rx="28" ry="19" fill="#e4f3fd" stroke="${WATER.line}" stroke-width="2.8"/>
      ${[[84, 106], [80, 114], [90, 116], [108, 106], [112, 114], [102, 116]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="${WATER.line}" opacity=".6"/>`).join("")}
      <ellipse cx="90" cy="100" rx="2.6" ry="3.4" fill="${INK}"/><ellipse cx="102" cy="100" rx="2.6" ry="3.4" fill="${INK}"/>
      ${smile(96, 120, 10, WATER.line)}
      ${eye(80, 82, 5, 6.4)}${eye(114, 82, 5, 6.4)}
      ${blush(70, 98, 6)}${blush(124, 98, 6)}
      <ellipse cx="100" cy="146" rx="66" ry="17" fill="none" stroke="${WATER.line}" stroke-width="16" opacity=".9"/>
      <ellipse cx="100" cy="146" rx="66" ry="17" fill="none" stroke="url(#${u}-water)" stroke-width="11"/>
      <path d="M50 140 Q60 134 74 133" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"/>
      <ellipse cx="46" cy="132" rx="9" ry="14" transform="rotate(25 46 132)" fill="url(#${u}-body)" stroke="${WATER.line}" stroke-width="3"/>
      <ellipse cx="154" cy="132" rx="9" ry="14" transform="rotate(-25 154 132)" fill="url(#${u}-body)" stroke="${WATER.line}" stroke-width="3"/>`),
  },
  // ---------------- grass ----------------
  {
    id: "sprout-fawn", name: "芽角小鹿", element: "grass", animal: "小鹿",
    signature: "鹿角是两根刚冒头的嫩芽；耳朵像叶片；背上的白斑是种子",
    svg: (u) => wrap(`${defs(u, GRASS)}${shadow(110, 64)}
      <ellipse cx="122" cy="152" rx="54" ry="30" fill="url(#${u}-body)" stroke="${GRASS.line}" stroke-width="3.2"/>
      ${[[112, 136], [130, 132], [148, 140], [122, 150], [140, 154]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="4" ry="3" fill="${GRASS.cream}"/>`).join("")}
      <ellipse cx="96" cy="180" rx="12" ry="6" fill="#5b3b24" stroke="${GRASS.line}" stroke-width="2.8"/><ellipse cx="148" cy="180" rx="12" ry="6" fill="#5b3b24" stroke="${GRASS.line}" stroke-width="2.8"/>
      <path d="M66 70 C64 58 66 48 70 40" stroke="#6b4a2a" stroke-width="4" stroke-linecap="round" fill="none"/>
      <path d="M70 44 C60 36 54 40 56 46 C60 50 66 48 70 44 Z M70 44 C76 34 84 36 82 42 C80 48 74 48 70 44 Z" fill="url(#${u}-leaf)" stroke="${GRASS.line}" stroke-width="2.2"/>
      <path d="M92 68 C94 56 98 48 104 42" stroke="#6b4a2a" stroke-width="4" stroke-linecap="round" fill="none"/>
      <path d="M103 44 C98 34 104 30 108 34 C110 40 106 44 103 44 Z M103 44 C112 40 116 44 112 48 C108 50 104 48 103 44 Z" fill="url(#${u}-leaf)" stroke="${GRASS.line}" stroke-width="2.2"/>
      <path d="M48 84 C32 74 20 78 18 86 C26 94 40 94 50 92 Z" fill="url(#${u}-leaf)" stroke="${GRASS.line}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M112 82 C128 70 142 72 146 80 C138 90 124 92 112 92 Z" fill="url(#${u}-leaf)" stroke="${GRASS.line}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M44 104 C44 80 62 66 82 66 C102 66 118 82 116 104 C114 126 100 138 80 138 C58 138 44 126 44 104 Z" fill="url(#${u}-body)" stroke="${GRASS.line}" stroke-width="3.2"/>
      <ellipse cx="62" cy="122" rx="17" ry="12" fill="url(#${u}-cream)"/>
      <ellipse cx="52" cy="116" rx="4.6" ry="3.4" fill="${INK}"/>
      ${eye(70, 100, 6, 8)}${eye(98, 98, 5.4, 7.4)}
      ${openMouth(62, 126, 10)}
      ${blush(80, 116, 6)}`),
  },
  {
    id: "leaf-koala", name: "叶耳考拉", element: "grass", animal: "考拉",
    signature: "两只大耳朵是带叶脉的叶子；抱着一根小树枝",
    svg: (u) => wrap(`${defs(u, GRASS)}${shadow(100, 50)}
      <ellipse cx="100" cy="150" rx="40" ry="34" fill="url(#${u}-body)" stroke="${GRASS.line}" stroke-width="3.2"/>
      <ellipse cx="100" cy="158" rx="24" ry="20" fill="url(#${u}-cream)"/>
      <ellipse cx="82" cy="182" rx="13" ry="7" fill="url(#${u}-body)" stroke="${GRASS.line}" stroke-width="3"/><ellipse cx="118" cy="182" rx="13" ry="7" fill="url(#${u}-body)" stroke="${GRASS.line}" stroke-width="3"/>
      <path d="M58 60 C30 40 14 62 22 84 C30 102 52 100 62 88 Z" fill="url(#${u}-leaf)" stroke="${GRASS.line}" stroke-width="3.2" stroke-linejoin="round"/>
      <path d="M58 76 C46 72 34 72 26 78 M44 72 L38 62 M40 74 L30 86" stroke="${GRASS.line}" stroke-width="2" stroke-linecap="round" opacity=".55" fill="none"/>
      <path d="M142 60 C170 40 186 62 178 84 C170 102 148 100 138 88 Z" fill="url(#${u}-leaf)" stroke="${GRASS.line}" stroke-width="3.2" stroke-linejoin="round"/>
      <path d="M142 76 C154 72 166 72 174 78 M156 72 L162 62 M160 74 L170 86" stroke="${GRASS.line}" stroke-width="2" stroke-linecap="round" opacity=".55" fill="none"/>
      <ellipse cx="100" cy="96" rx="48" ry="42" fill="url(#${u}-body)" stroke="${GRASS.line}" stroke-width="3.2"/>
      <path d="M96 92 C88 92 86 104 90 112 C94 118 106 118 110 112 C114 104 112 92 104 92 Z" fill="#3a3a44"/>
      <ellipse cx="96" cy="97" rx="3" ry="2" fill="#fff" opacity=".6"/>
      ${eye(76, 92, 5, 6.6)}${eye(124, 92, 5, 6.6)}
      ${smile(100, 124, 10, GRASS.line)}
      ${blush(68, 108, 7)}${blush(132, 108, 7)}
      <path d="M58 158 C80 142 120 128 150 116" stroke="#7a5230" stroke-width="7" stroke-linecap="round" fill="none"/>
      <path d="M150 116 C160 104 172 108 168 116 C162 122 154 120 150 116 Z M132 124 C134 110 146 110 144 118 C142 124 136 126 132 124 Z" fill="url(#${u}-leaf)" stroke="${GRASS.line}" stroke-width="2.2"/>
      <ellipse cx="80" cy="150" rx="10" ry="8" fill="url(#${u}-body)" stroke="${GRASS.line}" stroke-width="2.8"/><ellipse cx="118" cy="138" rx="10" ry="8" fill="url(#${u}-body)" stroke="${GRASS.line}" stroke-width="2.8"/>`),
  },
  {
    id: "moss-snail", name: "苔壳蜗牛", element: "grass", animal: "蜗牛",
    signature: "壳上长满青苔，壳顶冒出一朵小蘑菇和一片叶",
    svg: (u) => wrap(`${defs(u, GRASS)}${shadow(104, 66)}
      <path d="M30 176 C30 150 48 132 66 132 C80 132 90 144 92 160 L170 166 C178 168 178 182 168 184 L40 184 C34 184 30 182 30 176 Z" fill="url(#${u}-cream)" stroke="${GRASS.line}" stroke-width="3.2" stroke-linejoin="round"/>
      <path d="M54 134 C50 120 46 110 40 102" stroke="${GRASS.line}" stroke-width="3" stroke-linecap="round" fill="none"/><circle cx="39" cy="99" r="5" fill="url(#${u}-cream)" stroke="${GRASS.line}" stroke-width="2.6"/>
      <path d="M70 132 C72 118 76 108 82 100" stroke="${GRASS.line}" stroke-width="3" stroke-linecap="round" fill="none"/><circle cx="83" cy="97" r="5" fill="url(#${u}-cream)" stroke="${GRASS.line}" stroke-width="2.6"/>
      <circle cx="128" cy="124" r="44" fill="url(#${u}-body)" stroke="${GRASS.line}" stroke-width="3.2"/>
      <path d="M128 124 m0 -6 a6 6 0 1 1 -6 6 a12 12 0 1 1 12 12 a20 20 0 1 1 -20 -20 a30 30 0 1 1 30 30" fill="none" stroke="${GRASS.line}" stroke-width="2.6" stroke-linecap="round" opacity=".55"/>
      ${[[104, 98, 7], [150, 96, 6], [160, 128, 5], [112, 150, 5]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${GRASS.hi}" opacity=".7"/>`).join("")}
      <rect x="124" y="70" width="8" height="14" rx="3" fill="#fff4e0" stroke="${GRASS.line}" stroke-width="2.4"/>
      <path d="M112 72 C112 58 144 58 144 72 Z" fill="#ff7a6a" stroke="${GRASS.line}" stroke-width="2.6" stroke-linejoin="round"/>
      <circle cx="122" cy="66" r="2.6" fill="#fff"/><circle cx="134" cy="64" r="2" fill="#fff"/>
      <path d="M146 82 C148 70 160 66 164 72 C162 80 152 84 146 82 Z" fill="url(#${u}-leaf)" stroke="${GRASS.line}" stroke-width="2.2"/>
      ${eye(52, 154, 5.4, 7)}${eye(74, 152, 5, 6.6)}
      ${openMouth(62, 166, 9)}
      ${blush(44, 166, 5)}${blush(84, 164, 5)}`),
  },
];
