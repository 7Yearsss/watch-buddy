/**
 * Smooth (non-pixel) version of the red-panda fire cub: the same design as pixelpet.ts drawn as SVG, so curves
 * stay soft at any size. Poses are driven by a `data-action` attribute; CSS handles breathing, tail sway, flame
 * flicker, blinking and hopping. Everything still respects prefers-reduced-motion.
 */
export type VecAction = "idle" | "happy" | "sleepy" | "sleep";

const CSS = `
.vp { display: block; overflow: visible; }
.vp .breathe, .vp .tail, .vp .flame, .vp .eye-open, .vp .paw, .vp .hop { transform-box: fill-box; }
.vp .breathe { transform-origin: 50% 100%; animation: vp-breathe 2.4s ease-in-out infinite; }
.vp .tail { transform-origin: 0% 100%; animation: vp-sway 2.8s ease-in-out infinite; }
.vp .flame { transform-origin: 50% 100%; animation: vp-flicker .5s ease-in-out infinite alternate; }
.vp .eye-open { transform-origin: 50% 50%; animation: vp-blink 4.2s infinite; }
.vp .paw { transform-origin: 90% 95%; animation: vp-wave 1.6s ease-in-out infinite; }
.vp .hop { transform-origin: 50% 100%; }
.vp .eyes-happy, .vp .eyes-sleepy, .vp .eyes-closed, .vp .mouth-small, .vp .zzz { display: none; }
.vp[data-action="happy"] .hop { animation: vp-hop .9s cubic-bezier(.3,.7,.4,1) infinite; }
.vp[data-action="happy"] .eyes-open { display: none; }
.vp[data-action="happy"] .eyes-happy { display: inline; }
.vp[data-action="sleepy"] .eyes-open, .vp[data-action="sleep"] .eyes-open { display: none; }
.vp[data-action="sleepy"] .eyes-sleepy { display: inline; }
.vp[data-action="sleep"] .eyes-closed { display: inline; }
.vp[data-action="sleepy"] .mouth-open, .vp[data-action="sleep"] .mouth-open { display: none; }
.vp[data-action="sleepy"] .mouth-small, .vp[data-action="sleep"] .mouth-small { display: inline; }
.vp[data-action="sleepy"] .paw, .vp[data-action="sleep"] .paw { animation: none; transform: rotate(35deg) translate(4px, 10px); }
.vp[data-action="sleep"] .breathe { animation-duration: 4s; }
.vp[data-action="sleep"] .tail, .vp[data-action="sleepy"] .tail { animation-duration: 5s; }
.vp[data-action="sleep"] .zzz { display: inline; }
.vp .zzz text { animation: vp-z 2.4s ease-out infinite; }
.vp .zzz text:nth-child(2) { animation-delay: .8s; }
.vp .zzz text:nth-child(3) { animation-delay: 1.6s; }
@keyframes vp-breathe { 50% { transform: scale(1.015, 1.03); } }
@keyframes vp-sway { 50% { transform: rotate(-5deg); } }
@keyframes vp-flicker { to { transform: scale(.92, 1.08) skewX(-3deg); } }
@keyframes vp-blink { 0%, 94%, 100% { transform: scaleY(1); } 96% { transform: scaleY(.1); } }
@keyframes vp-wave { 50% { transform: rotate(-16deg); } }
@keyframes vp-hop { 0%, 100% { transform: translateY(0) scale(1.04, .96); } 15% { transform: translateY(0) scale(.97, 1.04); } 45% { transform: translateY(-16px) scale(.98, 1.02); } 75% { transform: translateY(0) scale(1.05, .95); } }
@keyframes vp-z { 0% { opacity: 0; transform: translate(0, 0); } 20% { opacity: 1; } 100% { opacity: 0; transform: translate(10px, -26px); } }
@media (prefers-reduced-motion: reduce) { .vp *, .vp .zzz text { animation: none !important; } }
`;

const LINE = "#5a2016";
export const SVG = `
<svg class="vp" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="vp-fur" cx="30%" cy="25%" r="85%">
      <stop offset="0" stop-color="#ffb06a"/><stop offset=".45" stop-color="#ef7038"/><stop offset="1" stop-color="#c2412d"/>
    </radialGradient>
    <radialGradient id="vp-body" cx="30%" cy="20%" r="90%">
      <stop offset="0" stop-color="#ff9a52"/><stop offset=".6" stop-color="#e3622f"/><stop offset="1" stop-color="#b53a2a"/>
    </radialGradient>
    <linearGradient id="vp-cream" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff7e8"/><stop offset="1" stop-color="#f3d2ad"/>
    </linearGradient>
    <linearGradient id="vp-dark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7a3a2c"/><stop offset="1" stop-color="#3f1d18"/>
    </linearGradient>
    <linearGradient id="vp-flame" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#ff6a2a"/><stop offset=".55" stop-color="#ffb53a"/><stop offset="1" stop-color="#ffe27a"/>
    </linearGradient>
    <clipPath id="vp-tail-clip"><path d="M112 168 C162 182 198 148 188 102 C185 88 178 80 170 76 L156 91 C166 99 171 114 166 131 C160 150 136 158 112 152 Z"/></clipPath>
    <clipPath id="vp-body-clip"><ellipse cx="100" cy="150" rx="37" ry="30"/></clipPath>
  </defs>

  <ellipse cx="104" cy="184" rx="56" ry="7" fill="rgba(0,0,0,.28)"/>

  <g class="hop">
    <!-- tail (behind) -->
    <g class="tail">
      <path d="M112 168 C162 182 198 148 188 102 C185 88 178 80 170 76 L156 91 C166 99 171 114 166 131 C160 150 136 158 112 152 Z" fill="url(#vp-body)"/>
      <g clip-path="url(#vp-tail-clip)" fill="#ffb877" opacity=".85">
        <rect x="132" y="148" width="44" height="12" transform="rotate(-36 154 154)"/>
        <rect x="156" y="114" width="44" height="12" transform="rotate(-72 178 120)"/>
      </g>
      <path d="M112 168 C162 182 198 148 188 102 C185 88 178 80 170 76 L156 91 C166 99 171 114 166 131 C160 150 136 158 112 152 Z" fill="none" stroke="${LINE}" stroke-width="3.2" stroke-linejoin="round"/>
      <g transform="translate(20 -10)"><g class="flame">
        <path d="M136 98 C128 82 136 70 143 58 C145 68 151 71 153 62 C161 74 168 86 162 98 C156 106 141 106 136 98 Z" fill="url(#vp-flame)" stroke="#c2361c" stroke-width="2.6" stroke-linejoin="round"/>
        <path d="M143 98 C140 90 145 84 148 78 C150 84 154 86 155 82 C159 89 158 96 154 100 C151 103 146 103 143 98 Z" fill="#fff4b8"/>
      </g></g>
    </g>

    <!-- body -->
    <g class="breathe">
      <ellipse cx="100" cy="150" rx="37" ry="30" fill="url(#vp-body)"/>
      <g clip-path="url(#vp-body-clip)"><rect x="60" y="160" width="80" height="30" fill="url(#vp-dark)"/></g>
      <ellipse cx="100" cy="150" rx="37" ry="30" fill="none" stroke="${LINE}" stroke-width="3.2"/>
      <ellipse cx="84" cy="178" rx="13" ry="8" fill="url(#vp-dark)" stroke="${LINE}" stroke-width="3"/>
      <ellipse cx="114" cy="179" rx="13" ry="8" fill="url(#vp-dark)" stroke="${LINE}" stroke-width="3"/>
      <!-- ears (behind head) -->
      <g stroke="${LINE}" stroke-width="3.2">
        <ellipse cx="52" cy="54" rx="20" ry="22" transform="rotate(-18 52 54)" fill="url(#vp-fur)"/>
        <ellipse cx="138" cy="48" rx="18" ry="21" transform="rotate(18 138 48)" fill="url(#vp-fur)"/>
      </g>
      <ellipse cx="53" cy="56" rx="11" ry="13" transform="rotate(-18 53 56)" fill="url(#vp-cream)"/>
      <ellipse cx="137" cy="50" rx="9.5" ry="12" transform="rotate(18 137 50)" fill="url(#vp-cream)"/>

      <!-- head -->
      <ellipse cx="96" cy="92" rx="58" ry="47" fill="url(#vp-fur)" stroke="${LINE}" stroke-width="3.2"/>
      <!-- cheek fluff sticking out on the near side -->
      <path d="M50 96 C40 98 34 104 38 108 C33 112 36 118 42 118 C40 124 48 128 56 124 Z" fill="url(#vp-cream)" stroke="${LINE}" stroke-width="3" stroke-linejoin="round"/>
      <ellipse cx="80" cy="113" rx="31" ry="21" fill="url(#vp-cream)"/>
      <ellipse cx="66" cy="72" rx="8.5" ry="5.5" fill="#fff4e4"/>
      <ellipse cx="114" cy="70" rx="7.5" ry="5" fill="#fff4e4"/>
      <!-- blush -->
      <ellipse cx="52" cy="112" rx="8" ry="4.5" fill="#ff7f86" opacity=".55"/>
      <ellipse cx="121" cy="108" rx="6" ry="3.5" fill="#ff7f86" opacity=".45"/>

      <!-- eyes -->
      <g class="eyes-open">
        <g class="eye-open">
          <ellipse cx="64" cy="92" rx="7.2" ry="9.2" fill="#24120e"/>
          <circle cx="61.5" cy="88" r="2.8" fill="#fff"/><circle cx="66.5" cy="96.5" r="1.2" fill="#fff" opacity=".8"/>
        </g>
        <g class="eye-open">
          <ellipse cx="110" cy="90" rx="6.4" ry="8.6" fill="#24120e"/>
          <circle cx="107.8" cy="86.2" r="2.5" fill="#fff"/><circle cx="112.3" cy="94.2" r="1.1" fill="#fff" opacity=".8"/>
        </g>
      </g>
      <g class="eyes-happy" fill="none" stroke="#24120e" stroke-width="3.4" stroke-linecap="round">
        <path d="M56 95 Q64 84 72 95"/><path d="M103 93 Q110 83 117 93"/>
      </g>
      <g class="eyes-sleepy">
        <ellipse cx="64" cy="95" rx="7.2" ry="5" fill="#24120e"/><ellipse cx="110" cy="93" rx="6.4" ry="4.6" fill="#24120e"/>
        <path d="M55 92 L73 92 M102 90 L118 90" stroke="${LINE}" stroke-width="3" stroke-linecap="round"/>
      </g>
      <g class="eyes-closed" fill="none" stroke="#24120e" stroke-width="3.2" stroke-linecap="round">
        <path d="M56 91 Q64 99 72 91"/><path d="M103 89 Q110 97 117 89"/>
      </g>

      <!-- nose + mouth -->
      <path d="M72 104 Q78 101 84 104 Q82 110 78 111 Q74 110 72 104 Z" fill="#24120e"/>
      <g class="mouth-open">
        <path d="M70 116 Q78 120 86 116 Q85 128 78 129 Q71 128 70 116 Z" fill="#5a1a14"/>
        <path d="M73 124 Q78 120 83 124 Q81 128.5 78 128.5 Q75 128.5 73 124 Z" fill="#ff7f86"/>
      </g>
      <path class="mouth-small" d="M74 117 Q78 121 82 117" fill="none" stroke="#5a1a14" stroke-width="2.6" stroke-linecap="round"/>
      <!-- waving paw -->
      <g class="paw">
        <path d="M72 158 C58 156 44 148 37 137 C32 128 38 119 47 121 C55 123 61 134 74 144 Z" fill="url(#vp-dark)" stroke="${LINE}" stroke-width="3" stroke-linejoin="round"/>
      </g>

    </g>
  </g>

  <g class="zzz" fill="#fff" font-family="ui-rounded, system-ui, sans-serif" font-weight="700">
    <text x="146" y="40" font-size="14">z</text><text x="156" y="28" font-size="11">z</text><text x="164" y="18" font-size="8">z</text>
  </g>
</svg>`;

let styled = false;

/** Mount the vector cub into `host` (idempotent) and set its pose. */
export function mountVectorPet(host: HTMLElement, action: VecAction) {
  if (!styled) {
    const s = document.createElement("style");
    s.textContent = CSS;
    document.head.append(s);
    styled = true;
  }
  if (!host.querySelector("svg.vp")) host.innerHTML = SVG;
  host.querySelector("svg.vp")!.setAttribute("data-action", action);
}
