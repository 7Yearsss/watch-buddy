import {
  addDays,
  effectiveness,
  getSkill,
  isBossDay,
  knownSkills,
  petStats,
  petTypes,
  RARITIES,
  STATS,
  validateLoadout,
  ACTIVE_DAYS_FOR_UPGRADE,
  type AdultVariant,
  type BattleEvent,
  type EchoType,
  type ElementType,
  type EvolutionGap,
  type PetState,
  type SkillId,
  type Starter,
  type Tactic,
} from "@pulseling/engine";
import { PERSONAS, type PersonaId } from "@pulseling/sim/personas";
import {
  chat,
  chatsLeft,
  chooseEvolution,
  readLetter,
  clearSave,
  currentLoadout,
  condition,
  dayNumber,
  liveDay,
  load,
  newGame,
  nextBossType,
  personaDay,
  ROSTER,
  FRIENDS,
  fightFriend,
  fightBoss,
  foughtFriendToday,
  friendState,
  save,
  setLoadout,
  setTarget,
  startTrial,
  status,
  type BattleReport,
  type DayInput,
  type GameState,
} from "./game";
import { drawSprite, PALETTES, type SpriteAction, type SpriteSpec } from "./sprites";
import {
  hatchLine,
  moodOf,
  morningLine,
  PERSONALITY_NAME,
  RARITY_NAME,
  rarityLabel,
  skillName,
  speciesName,
  STAT_NAME,
  TACTIC_NAME,
  TYPE_NAME,
  VARIANT_NAME,
} from "@pulseling/game";
import "@fontsource/fusion-pixel-12px-proportional-sc";
import { describeSprite } from "@pulseling/game";
import { CHATS_PER_DAY, REPLIES, type ReplyId } from "@pulseling/game";
import { morningCard, type MorningCard } from "@pulseling/game";
import { queueShow, setReducedMotion } from "./shows";
import { renderShareCard, type ShareCard } from "./share";
import { dayPhase, fmtClock, sleepWindow, type DayPhase } from "@pulseling/game";
import { CHANNEL_DEFAULT, CHANNEL_NAME, noticesFor, smartStackRelevance, type Notice } from "@pulseling/game";
import { HINT, ITEMS, MOVE_NAME, SURPRISE_ICON, type IdleMove } from "@pulseling/game";

type Tab = "today" | "pet" | "dex" | "battle" | "data";
type SliderKey = "steps" | "sleepHours" | "bedtime" | "cardio" | "strength" | "hiit" | "deep";
interface Sliders { worn: boolean; steps: number; sleepHours: number; bedtime: number; cardio: number; strength: number; hiit: number; deep: number }

const PRESETS: Record<string, { label: string; v: Sliders }> = {
  lazy: { label: "偷懒日", v: { worn: true, steps: 2500, sleepHours: 5.5, bedtime: 90, cardio: 0, strength: 0, hiit: 0, deep: 12 } },
  normal: { label: "普通日", v: { worn: true, steps: 7000, sleepHours: 7, bedtime: -30, cardio: 0, strength: 0, hiit: 0, deep: 16 } },
  run: { label: "跑步日", v: { worn: true, steps: 10000, sleepHours: 7.5, bedtime: -30, cardio: 40, strength: 0, hiit: 0, deep: 17 } },
  lift: { label: "力量日", v: { worn: true, steps: 7000, sleepHours: 7.5, bedtime: -30, cardio: 0, strength: 50, hiit: 0, deep: 17 } },
  perfect: { label: "完美日", v: { worn: true, steps: 12000, sleepHours: 8, bedtime: -45, cardio: 45, strength: 30, hiit: 20, deep: 19 } },
  off: { label: "没戴手表", v: { worn: false, steps: 0, sleepHours: 7, bedtime: -30, cardio: 0, strength: 0, hiit: 0, deep: 16 } },
};

const PERSONA_NAME: Record<PersonaId, string> = { sedentary: "久坐", walker: "爱走路", runner: "跑步", lifter: "力量", athlete: "全能", improver: "正在改善" };
const SLIDERS: { key: SliderKey; label: string; min: number; max: number; step: number; fmt: (v: number) => string }[] = [
  { key: "steps", label: "步数", min: 0, max: 20000, step: 500, fmt: (v) => `${v}` },
  { key: "sleepHours", label: "睡眠", min: 3, max: 11, step: 0.25, fmt: (v) => `${v} 小时` },
  { key: "bedtime", label: "入睡时间", min: -180, max: 180, step: 15, fmt: clock },
  { key: "cardio", label: "有氧", min: 0, max: 120, step: 5, fmt: (v) => `${v} 分钟` },
  { key: "strength", label: "力量", min: 0, max: 120, step: 5, fmt: (v) => `${v} 分钟` },
  { key: "hiit", label: "高强度", min: 0, max: 60, step: 5, fmt: (v) => `${v} 分钟` },
  { key: "deep", label: "深睡比例", min: 5, max: 30, step: 1, fmt: (v) => `${v}%` },
];

function clock(min: number) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function toDayInput(v: Sliders): DayInput {
  if (!v.worn) return { worn: false };
  const sleepMinutes = Math.round(v.sleepHours * 60);
  return {
    worn: true,
    steps: v.steps,
    standHours: Math.round(8 + v.steps / 2500),
    activeEnergyKcal: Math.round(150 + v.steps * 0.04 + v.cardio * 9 + v.strength * 6 + v.hiit * 11),
    flightsClimbed: Math.round(v.steps / 1500),
    sleepMinutes,
    bedtimeMinutes: v.bedtime,
    deepSleepRatio: v.deep / 100,
    nightHrvMs: Math.round(45 + (v.sleepHours - 7) * 3),
    restingHr: 63,
    cardioMinutes: v.cardio,
    distanceKm: Math.round((v.cardio / 6.5) * 10) / 10,
    strengthMinutes: v.strength,
    highIntensityMinutes: v.hiit,
    intervalMinutes: Math.round(v.hiit * 0.6),
    highHrZoneMinutes: Math.round(v.cardio * 0.4 + v.hiit * 0.8 + v.strength * 0.15),
  };
}

let state: GameState | null = load();
let tab: Tab = "today";
/** First run: pick an egg → why we read Health data (priming) → system sheet → reading 28 days → hatch. */
let setup: { starter: Starter; persona: PersonaId; step: "egg" | "health" | "sheet" | "reading"; denied: boolean; pending: GameState | null } = { starter: "fire", persona: "walker", step: "egg", denied: false, pending: null };
let sliders: Sliders = { ...PRESETS.normal!.v };
interface ReplayState { report: BattleReport; mine: Omit<SpriteSpec, "frame">; theirs: Omit<SpriteSpec, "frame">; step: number; boss: boolean; title?: string; theirName?: string }
let replay: ReplayState | null = null;
let dexOpen: string | null = null;
let shareOpen: { kind: "pet" | "boss" | "dex"; includePrivate: boolean } | null = null;
let replaySpeed: 1 | 2 = 1;
let replayTimer: ReturnType<typeof setInterval> | undefined;
/** Replays step on their own clock (not the 500 ms sprite tick) so 2× speed works. */
function startReplayClock() {
  clearInterval(replayTimer);
  replayTimer = setInterval(() => {
    if (!replay) return clearInterval(replayTimer);
    if (replay.step >= replay.report.result.log.length) return clearInterval(replayTimer);
    replay.step++;
    render();
  }, replaySpeed === 2 ? 380 : 760);
}
/** Pre-battle charge-up: one tap on the watch when the marker is in the middle (Vital Bracelet-style timing). */
let charging: { friendId: string; start: number; onWatch?: boolean } | null = null;
/** Watch app pages, moved between with the Digital Crown (vertical pagination, watchOS 10+). */
type WatchPage = "pet" | "today" | "battle";
const WATCH_PAGES: WatchPage[] = ["pet", "today", "battle"];
let watchPage: WatchPage = "pet";
let watchResult: string | null = null;
let lastFriendReplay: ReplayState | null = null;
/** Preview panel under the watch: watch-face complications, Smart Stack card, notifications. */
let glanceTab: "faces" | "stack" | "notices" = "faces";
let stackHour = new Date().getHours();
let daysAway = 0;
const CHANNELS_KEY = "pulseling-notice-channels";
let channels: Record<Notice["channel"], boolean> = (() => {
  try { return { ...CHANNEL_DEFAULT, ...JSON.parse(localStorage.getItem(CHANNELS_KEY) ?? "{}") }; } catch { return { ...CHANNEL_DEFAULT }; }
})();
const CHARGE_PERIOD = 1400;
const chargePos = (t: number) => { const p = (t % CHARGE_PERIOD) / CHARGE_PERIOD; return p < 0.5 ? p * 2 : 2 - p * 2; };
let frame = 0;
/** Reduce Motion: honour the system setting (or the prototype toggle). Sprites hold still, shows jump to the result card. */
const RM_KEY = "pulseling-reduce-motion";
let forceReduce = localStorage.getItem(RM_KEY) === "1";
const reduceMotion = () => forceReduce || matchMedia("(prefers-reduced-motion: reduce)").matches;
function applyReduceMotion() {
  document.body.classList.toggle("reduce", reduceMotion());
  setReducedMotion(reduceMotion());
}
let heart = false;
let moveAnim: IdleMove | null = null;
let bubbleAt = 0;
/** Always-On (wrist down): static dimmed sleeping frame, big clock, nothing animates (07 §4). */
let aod = false;

/** What the watch pet is doing right now: tapped → happy, just spoke → talk, otherwise its mood. */
function liveAction(s: GameState): SpriteAction {
  if (s.trial === "offered") return "sleep";
  const phase = phaseOf(s);
  if (phase === "sleep" && !heart) return "sleep";
  if (phase === "winddown" && !heart && !bubble) return "sleepy";
  if (heart) return "happy";
  if (bubble && performance.now() - bubbleAt < 1600) return "talk";
  const mood = currentMood(s);
  return mood === "sleepy" ? "sleepy" : mood === "bored" ? "bored" : "idle";
}
let bubble: string | null = null;
let bubbleTimer: ReturnType<typeof setTimeout> | undefined;
let seenMorning = state?.morning?.date ?? null;
let paywallHidden = false;
let openLetter: string | null = null;
/** Watch version of the morning card: 3 screens, ~1s each, tap to advance (07 §1). */
let watchCard: { card: MorningCard; step: number } | null = null;
let watchCardTimer: ReturnType<typeof setInterval> | undefined;
/** The phone card animates once per morning; later renders show it settled. */
let phoneCardShown: string | null = state?.morning?.date ?? null;
const WATCH_SCREENS = 3;

const app = document.getElementById("app")!;

const enc = (spec: Omit<SpriteSpec, "frame">) => encodeURIComponent(JSON.stringify(spec));
/** Every sprite is an image with a spoken description for VoiceOver. */
const canvas = (spec: Omit<SpriteSpec, "frame">, cls = "") => `<canvas data-sprite="${enc(spec)}" class="${cls}" role="img" aria-label="${describeSprite(spec)}"></canvas>`;
const typePill = (t: ElementType | null) => (t ? `<span class="pill type" style="background:${PALETTES[t].main}">${TYPE_NAME[t]}</span>` : `<span class="pill">无属性</span>`);
const pct = (x: number) => `${Math.round(x * 100)}%`;

function petSpec(pet: PetState, variant: AdultVariant | undefined = pet.adultVariant, stage: PetState["stage"] = pet.stage, mood?: SpriteSpec["mood"]): Omit<SpriteSpec, "frame"> {
  const secondary = stage === "adult" && variant && variant !== "pure" ? (variant as ElementType) : null;
  return { primary: pet.starter, secondary, stage, variant: stage === "adult" ? variant ?? "pure" : undefined, shiny: pet.shiny, cosmetics: pet.cosmetics, rarity: pet.rarity, mood };
}

const wildSpec = (id: string, shiny = false): Omit<SpriteSpec, "frame"> => {
  const sp = ROSTER.find((s) => s.id === id);
  return { primary: (sp?.type ?? "grass") as ElementType, stage: "wild", shiny, seed: id };
};

function opponentSpec(r: BattleReport, boss: boolean): Omit<SpriteSpec, "frame"> {
  if (boss) return { primary: (r.opponentType ?? "dragon") as ElementType, stage: "adult", variant: "pure" };
  if (r.opponentName === "training-dummy") return { primary: "ground", stage: "baby" };
  return wildSpec(r.opponentName, r.shiny);
}

function currentMood(s: GameState) {
  return moodOf(s.lastEchoes, s.history[s.history.length - 1]?.sleepMinutes);
}

function watchLine(s: GameState): string {
  if (s.trial === "offered") return "zzz……（冬眠中，开启试用叫醒它）";
  if (!s.morning) return hatchLine(s.pet.personality, s.facts);
  const m = s.morning;
  return morningLine(s.pet.personality, m.sleepMinutes, currentMood(s), m.encounter, m.captured, speciesName(m.trial.opponentName));
}

function renderStart(): string {
  const dots = `<div class="ob-dots">${["egg", "health", "reading"].map((k) => `<i class="${k === setup.step || (k === "health" && setup.step === "sheet") ? "on" : ""}"></i>`).join("")}</div>`;
  if (setup.step === "egg") {
    return `<div class="start stack">
      ${dots}
      <h1>选一颗蛋</h1>
      <p class="muted">它会读你过去一个月的健康数据，当场孵化。以后你怎么生活，它就怎么长大。</p>
      <div class="choices">
        ${(["grass", "water", "fire"] as Starter[])
          .map((t) => `<div class="choice ${setup.starter === t ? "on" : ""}" data-act="starter" data-v="${t}">${canvas({ primary: t, stage: "egg" })}<div>${TYPE_NAME[t]}系</div><div class="muted" style="font-size:12px">${{ grass: "爱走路的会更快长大", water: "睡得好的会更快长大", fire: "爱运动的会更快长大" }[t]}</div></div>`)
          .join("")}
      </div>
      <p class="muted" style="font-size:12px">三种蛋最终都能进化成任何形态，只是起点不同。</p>
      <button class="primary" data-act="ob-next" data-v="health">下一步</button>
    </div>`;
  }
  if (setup.step === "health" || setup.step === "sheet") {
    return `<div class="start stack">
      ${dots}
      <h1>它靠你的健康数据长大</h1>
      <div class="card ob-why">
        <div class="ob-row"><span class="ob-ico">👟</span><div><b>活动</b><div class="muted">步数、站立、运动时长 → 决定它的体力、攻击、速度</div></div></div>
        <div class="ob-row"><span class="ob-ico">🌙</span><div><b>睡眠</b><div class="muted">睡多久、几点睡、深睡 → 决定它的恢复力和心情</div></div></div>
        <div class="ob-row"><span class="ob-ico">♥</span><div><b>心脏</b><div class="muted">静息心率、心率变异性 → 只用来判断你的状态</div></div></div>
      </div>
      <ul class="muted ob-promise">
        <li>只读取，不写入你的健康数据</li>
        <li>每天只上传一行算好的汇总，原始记录留在手机上，不上传位置</li>
        <li>永远跟你自己比，不跟别人比</li>
      </ul>
      <button class="primary" data-act="ob-sheet">好，去授权</button>
      <button data-act="ob-deny">先不授权，直接孵化</button>
      <div class="card"><h3 style="margin-top:0">原型专用：模拟"过去一个月的你"</h3><div class="personas">
        ${PERSONAS.map((p) => `<button class="small ${setup.persona === p.id ? "primary" : ""}" data-act="persona" data-v="${p.id}">${PERSONA_NAME[p.id]}</button>`).join("")}
      </div></div>
      ${setup.step === "sheet" ? renderHealthSheet() : ""}
    </div>`;
  }
  // reading: the hatch facts appear one by one, then the hatch show plays
  const f = setup.pending?.facts;
  const lines = !f || f.historyDays < 7
    ? ["没有读到健康数据也没关系", "它会从今天开始，跟你一起长大", "以后在设置里打开健康数据，它就能长得更快"]
    : [
        `读到了 ${f.historyDays} 天的数据`,
        `平均每天走 ${Math.round((f.avgSteps ?? 0) / 100) * 100} 步`,
        f.avgSleepMinutes ? `每晚睡 ${Math.floor(f.avgSleepMinutes / 60)} 时 ${String(Math.round(f.avgSleepMinutes % 60)).padStart(2, "0")} 分` : "睡眠数据不多",
        (f.weeklyCardioMinutes ?? 0) >= 30 ? `每周有氧 ${Math.round(f.weeklyCardioMinutes ?? 0)} 分钟` : (f.weeklyStrengthMinutes ?? 0) >= 20 ? `每周力量训练 ${Math.round(f.weeklyStrengthMinutes ?? 0)} 分钟` : "蛋里开始有动静了……",
      ];
  return `<div class="start stack ob-reading">
    ${dots}
    <div style="text-align:center">${canvas({ primary: setup.starter, stage: "egg" })}</div>
    ${lines.map((l, i) => `<p class="ob-line" style="animation-delay:${0.2 + i * 0.7}s">${l}</p>`).join("")}
  </div>`;
}

/** Mock of the fixed iOS Health sheet: the app can't customise it, which is why the priming screen above matters. */
function renderHealthSheet(): string {
  const items = ["步数", "站立时间", "活动能量", "体能训练", "睡眠", "静息心率", "心率变异性", "已爬楼层"];
  return `<div class="modal-bg"><div class="modal ios-sheet">
    <div class="muted" style="font-size:12px;text-align:center">（模拟系统弹窗，App 不能改它的样子）</div>
    <h2 style="text-align:center">"Pulseling"想要访问你的健康数据</h2>
    <div class="row" style="justify-content:space-between"><b>全部打开</b><input type="checkbox" checked disabled></div>
    ${items.map((i) => `<div class="row" style="justify-content:space-between"><span>${i}</span><input type="checkbox" checked disabled></div>`).join("")}
    <div class="row" style="justify-content:space-between;margin-top:10px"><button data-act="ob-deny">不允许</button><button class="primary" data-act="ob-allow">允许</button></div>
  </div></div>`;
}

const SHORT_GREETING: Record<PetState["personality"], string> = { genki: "元气满满！", tsundere: "哼，早。", gentle: "早安～", chuuni: "吾已苏醒。", chill: "早……" };

/** One short line for the watch bubble (about 10 characters). The full sentence lives on the phone. */
function shortLine(s: GameState): string {
  if (s.trial === "offered") return "zzz……";
  if (s.pendingShort) return s.pendingShort;
  if (s.letters[0] && !s.letters[0].read && s.letters[0].date === s.today) return "给你写了封信！";
  const st = status(s);
  if (st.ready && !st.auto) return "我好像要进化了！";
  const m = s.morning;
  if (!m) return "你好呀！";
  if (s.bossPending) return "Boss 来了！";
  if (s.boss && s.boss.date === s.today) return s.boss.result.winner === "a" ? "打赢 Boss 啦！" : "Boss 好强……";
  const name = speciesName(m.trial.opponentName);
  if (m.encounter && m.newSpecies) return `收服了${name}！`;
  if (m.encounter && m.captured) return `又碰到${name}了`;
  if (m.encounter) return `${name}跑掉了…`;
  if (m.surprise && m.date === s.today) return m.surprise.short;
  const phase = phaseOf(s);
  if (phase === "sleep") return "zzz……";
  if (phase === "winddown") return "快到睡觉时间啦";
  const mood = currentMood(s);
  if (mood === "sleepy") return "好困……";
  if (mood === "bored") return "想出去走走～";
  return SHORT_GREETING[s.pet.personality];
}

/** Something worth a look: evolution waiting for a choice, or an unread letter. */
function needsAttention(s: GameState): boolean {
  const st = status(s);
  return s.trial !== "offered" && ((st.ready && !st.auto) || !!s.bossPending || s.letters.some((l) => !l.read));
}

function showBubble(text: string) {
  bubble = text;
  bubbleAt = performance.now();
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    bubble = null;
    render();
  }, 4000);
}

/** Prototype time override (minutes since midnight), so the day/night cycle can be tried at any hour. */
let timeOverride: number | null = null;
/**
 * After a workout is saved to Health (any app, incl. Apple's Workout app), HealthKit background delivery wakes us a
 * few minutes later. We can't see a workout live unless it was started in our own app, so the pet reacts *after*:
 * the next wrist raise shows it cheering, and says which stat will grow tomorrow morning. No push, no number yet.
 */
type WorkoutKind = "cardio" | "strength" | "hiit";
let lastWorkout: { kind: WorkoutKind; minutes: number; at: number } | null = null;
const WORKOUT_NAME: Record<WorkoutKind, string> = { cardio: "有氧", strength: "力量训练", hiit: "高强度训练" };
const WORKOUT_STAT: Record<WorkoutKind, string> = { cardio: "速度", strength: "攻击", hiit: "速度" };
const freshWorkout = () => (lastWorkout && performance.now() - lastWorkout.at < 10 * 60_000 ? lastWorkout : null);
const nowMinutes = () => timeOverride ?? (new Date().getHours() * 60 + new Date().getMinutes());
const clockNow = () => (timeOverride === null ? new Date().toTimeString().slice(0, 5) : fmtClock(timeOverride));
const phaseOf = (s: GameState): DayPhase => dayPhase(nowMinutes(), sleepWindow(s.history));

function renderWatch(s: GameState): string {
  const st = status(s);
  const asleep = s.trial === "offered";
  const nearEvolution = st.threshold > 0 && st.progress / st.threshold >= 0.85;
  const spec = { ...petSpec(s.pet, undefined, undefined, asleep ? "sleepy" : currentMood(s)), glow: nearEvolution && !asleep };
  if (aod) {
    return `<div class="watch-wrap">
      <div class="watch aod" data-act="aod">
        <div class="aod-time">${clockNow()}</div>
        ${canvas({ ...petSpec(s.pet), action: "sleep", dim: true }, "aod-pet")}
      </div>
      <button class="small" data-act="aod">抬起手腕</button>
      ${renderComplications(s, st)}
    </div>`;
  }
  const pager = `<div class="wpager">${WATCH_PAGES.map((p) => `<i class="${p === watchPage ? "on" : ""}" data-act="wpage" data-v="${p}"></i>`).join("")}</div>`;
  const page =
    watchPage === "today" ? watchToday(s, st) :
    watchPage === "battle" ? watchBattle(s) :
    `${needsAttention(s) && !bubble ? '<div class="attn">!</div>' : ""}
      ${bubble ? `<div class="bubble">${bubble}</div>` : ""}
      ${canvas(spec, `pet-tap${moveAnim ? ` mv-${moveAnim}` : ""}`)}
      ${heart ? '<div class="heart">♥</div>' : ""}`;
  return `<div class="watch-wrap">
    ${watchCard ? watchCardFace(s, watchCard) : `<div class="watch page-${watchPage} phase-${phaseOf(s)}" data-crown="1">
      <div class="clock">${clockNow()}</div>
      ${page}
      ${asleep ? "" : pager}
    </div>`}
    ${freshWorkout() && heart ? '<div class="haptic">【震动：成功】运动保存几分钟后，下次抬腕时</div>' : ""}
    ${watchCard ? '<div class="haptic">【震动：通知】整段只震这一次</div>' : !asleep ? '<button class="small" data-act="aod">放下手腕（常亮模式）</button>' : ""}
    ${watchCard ? "" : asleep ? '<button class="small" data-act="wake">叫醒它</button>' : '<div class="muted" style="font-size:12px">滚轮 = 表冠，上下翻页；点宠物看它想说什么</div>'}
    ${renderComplications(s, st)}
  </div>`;
}

/** Glance page: growth ring, yesterday's gain, the one thing that happened. Readable in ~2 seconds. */
function watchToday(s: GameState, st: ReturnType<typeof status>): string {
  const p = st.threshold ? Math.min(1, st.progress / st.threshold) : 1;
  const last = s.results[s.results.length - 1];
  const m = s.morning;
  const wo = freshWorkout();
  const line = wo ? `刚运动完！明早${WORKOUT_STAT[wo.kind]}会涨` : !m ? "今天还没开奖" : m.encounter ? (m.newSpecies ? `收服了${speciesName(m.trial.opponentName)}` : `遇到${speciesName(m.trial.opponentName)}`) : m.surprise ? m.surprise.short : "附近很安静";
  const bossIn = daysUntilBoss(s);
  return `<div class="wp">
    <div class="wc-ring" style="--from:${p};--to:${p}">${canvas(petSpec(s.pet, undefined, undefined, currentMood(s)))}</div>
    <div class="wp-big">${s.pet.stage === "adult" ? "成熟体" : `进化 ${pct(p)}`}</div>
    <div class="wp-line">${last ? `昨天 +${Math.round(last.gain)}` : "第一天"} · ${line}</div>
    <div class="wp-dim">Boss ${bossIn === 0 ? "就是今天" : `还有 ${bossIn} 天`}</div>
  </div>`;
}

/** Battle page: friends list with a one-tap charge-up right on the watch; replays stay on the phone. */
function watchBattle(s: GameState): string {
  if (charging?.onWatch) {
    return `<div class="wp" data-act="charge">
      <div class="wp-big">vs ${chargeTargetName(s, charging.friendId)}</div>
      <div class="wp-line">走到中间时点一下</div>
      <div class="gauge w"><div class="gauge-sweet"></div><div class="gauge-mark"></div></div>
      <div class="wp-dim">点屏幕任意位置蓄力</div>
    </div>`;
  }
  if (watchResult) {
    return `<div class="wp" data-act="w-result"><div class="wp-big">${watchResult}</div><div class="wp-dim">${watchResult.startsWith("赢") ? "【震动：成功】" : "（不震动）"}<br>回放在手机上看</div></div>`;
  }
  const boss = s.bossPending ? `<div class="wrow boss" role="button" tabindex="0" aria-label="挑战周 Boss" data-act="w-boss"><span>⚔ ${TYPE_NAME[s.bossPending.type as ElementType]}系 Boss</span><span>开打 ›</span></div>` : "";
  return `<div class="wp wp-list">
    ${boss}
    <div class="wp-dim">好友切磋</div>
    ${FRIENDS.map((f) => {
      const done = foughtFriendToday(s, f.id);
      return `<div class="wrow ${done ? "done" : ""}" ${done ? 'aria-disabled="true"' : `role="button" tabindex="0" aria-label="跟${f.name}切磋" data-act="w-friend" data-v="${f.id}"`}><span>${f.name}</span><span>${done ? "✓" : "切磋 ›"}</span></div>`;
    }).join("")}
  </div>`;
}

function daysUntilBoss(s: GameState): number {
  for (let i = 0; i < 14; i++) if (isBossDay(addDays(s.today, i), s.pet.hatchedOn)) return i;
  return 7;
}

function watchCardFace(s: GameState, w: { card: MorningCard; step: number }): string {
  const c = w.card;
  const dots = `<div class="wc-dots">${[0, 1, 2].map((i) => `<i class="${i === w.step ? "on" : ""}"></i>`).join("")}</div>`;
  let body = "";
  if (w.step === 0) {
    const label = { good: "睡得好", ok: "还行", short: "有点少", none: "" }[c.night.icon];
    body = `${canvas(petSpec(s.pet, undefined, undefined, "sleepy"))}<div class="wc-cap">☾ 昨晚 ${c.night.icon === "none" ? "没戴表" : c.night.text}<br><span class="wc-dim">${label}</span></div>`;
  } else if (w.step === 1) {
    body = `${canvas(petSpec(s.pet, undefined, undefined, "happy"))}<div class="wc-cap">${c.headline}</div>`;
  } else {
    const encounter = c.surprise.kind !== "small";
    body = `<div class="wc-ring" style="--from:${c.from};--to:${c.to}">${canvas(petSpec(s.pet, undefined, undefined, "happy"))}</div>
      <div class="wc-cap">成长 +${c.gain}<br><span class="${encounter ? "wc-alert" : "wc-dim"}">${encounter ? "！" : ""}${c.surprise.short}</span></div>`;
  }
  return `<div class="watch wc" data-act="wc-next"><div class="clock">${clockNow()}</div><div class="wc-screen" data-step="${w.step}">${body}</div>${dots}</div>`;
}

function playWatchCard(card: MorningCard) {
  clearInterval(watchCardTimer);
  watchCard = { card, step: 0 };
  watchCardTimer = setInterval(nextWatchScreen, 1300);
}

function nextWatchScreen() {
  if (!watchCard) return;
  watchCard.step++;
  if (watchCard.step >= WATCH_SCREENS) {
    clearInterval(watchCardTimer);
    watchCard = null;
    if (state) showBubble(shortLine(state));
  }
  repaintWatch();
}

/** Swap only the watch so the phone card's animation isn't restarted. */
function repaintWatch() {
  const wrap = app.querySelector(".watch-wrap");
  if (!wrap || !state) return render();
  const tmp = document.createElement("div");
  tmp.innerHTML = renderWatch(state);
  wrap.replaceWith(tmp.firstElementChild!);
  drawAll();
}

function renderMorningCard(s: GameState): string {
  const st = status(s);
  const c = morningCard(s, st.progress, st.threshold);
  if (!c) return "";
  const animate = phoneCardShown !== c.date;
  phoneCardShown = c.date;
  const icon = { good: "☀ 睡得好", ok: "☁ 还行", short: "☾ 有点少", none: "· 没戴表" }[c.night.icon];
  const stageLabel = s.pet.stage === "adult" ? "已经是成熟体" : `进化 ${pct(c.to)}`;
  return `<div class="card mc ${animate ? "anim" : ""}" data-act="mc-skip">
    <div class="mc-step"><h3>昨晚</h3><p><b>${c.night.icon === "none" ? "没戴手表睡觉" : c.night.text}</b> <span class="muted">${icon}</span></p></div>
    <div class="mc-step"><h3>昨天</h3>${c.highlights.map((h) => `<p>${h}</p>`).join("")}</div>
    <div class="mc-step"><h3>成长</h3><p>今天 <b>+${c.gain}</b> <span class="muted">${stageLabel}</span></p>
      <div class="mc-bar" style="--from:${c.from};--to:${c.to}"><i></i></div></div>
    <div class="mc-step"><h3>${c.surprise.label}</h3><p class="${c.surprise.kind === "capture" ? "good" : ""}">${c.surprise.text}</p></div>
    ${animate ? '<div class="muted mc-hint">点一下跳过</div>' : ""}
  </div>`;
}

function glanceFacts(s: GameState) {
  const st = status(s);
  return {
    evolveReady: st.ready && !st.auto,
    bossToday: !!s.bossPending || (!!s.boss && s.boss.date === s.today),
    bossPending: !!s.bossPending,
    bossWon: s.boss?.result.winner === "a",
    lettersUnread: s.letters.some((l) => !l.read && l.date === s.today),
    daysAway,
  };
}

/** Everything you see without opening the app: complications (4 WidgetKit families), Smart Stack, notifications. */
function renderComplications(s: GameState, st: ReturnType<typeof status>): string {
  const tabs = (["faces", "stack", "notices"] as const).map((t) => `<button class="small ${glanceTab === t ? "primary" : ""}" data-act="glance" data-v="${t}">${{ faces: "表盘", stack: "智能叠放", notices: "通知" }[t]}</button>`).join("");
  const body = glanceTab === "faces" ? renderFaces(s, st) : glanceTab === "stack" ? renderStack(s) : renderNotices(s);
  return `<div class="complications"><div class="row" style="justify-content:center">${tabs}</div>${body}</div>`;
}

/** Corner family: a 90° gauge hugging the bezel. */
function cornerArc(p: number): string {
  const r = 24, cx = 28, cy = 28, a0 = Math.PI, a1 = Math.PI * 1.5;
  const pt = (a: number) => `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
  const end = a0 + (a1 - a0) * Math.max(0.001, p);
  return `<svg class="corner-svg" viewBox="0 0 56 56"><path d="M ${pt(a0)} A ${r} ${r} 0 0 1 ${pt(a1)}" stroke="#333" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M ${pt(a0)} A ${r} ${r} 0 0 1 ${pt(end)}" stroke="#6ee7a0" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`;
}

function renderFaces(s: GameState, st: ReturnType<typeof status>): string {
  const progress = st.threshold ? Math.min(1, st.progress / st.threshold) : 1;
  const deg = Math.round(progress * 360);
  const head = petSpec(s.pet, undefined, undefined, s.trial === "offered" ? "sleepy" : currentMood(s));
  const evo = s.pet.stage === "adult" ? "成熟体" : `进化 ${pct(progress)}`;
  const attn = needsAttention(s) ? "！" : "";
  const bossIn = daysUntilBoss(s);
  return `<div class="faces">
    <div class="face-row">
      <div class="fam"><div class="comp-circle" style="background:conic-gradient(#6ee7a0 ${deg}deg, #333 0)"><div class="comp-inner">${canvas(head)}</div></div><span>圆形</span></div>
      <div class="fam"><div class="comp-corner-g">${cornerArc(progress)}<div class="corner-head">${canvas(head)}</div></div><span>角落</span></div>
    </div>
    <div class="fam"><div class="comp-rect"><div class="rect-head">${canvas(head)}</div><div class="rect-text"><b>${attn}${shortLine(s)}</b><div>${evo}</div><div class="rect-dim">Boss ${bossIn === 0 ? "今天" : `${bossIn} 天后`}</div></div></div><span>矩形</span></div>
    <div class="fam"><div class="comp-inline">${attn}${evo} · Boss ${bossIn === 0 ? "今天" : `${bossIn}天`}</div><span>单行（只能放文字和系统图标）</span></div>
  </div>`;
}

function renderStack(s: GameState): string {
  const r = smartStackRelevance(s, glanceFacts(s), stackHour);
  const hours = [7, 13, 22].map((h) => `<button class="small ${stackHour === h ? "primary" : ""}" data-act="stack-hour" data-v="${h}">${h}:00</button>`).join("");
  return `<div class="stack-prev">
    <div class="row" style="justify-content:center">${hours}</div>
    <div class="ss ${r.score >= 0.6 ? "top" : ""}">
      <div class="ss-head">${canvas(petSpec(s.pet, undefined, undefined, currentMood(s)))}</div>
      <div><b>${r.title}</b><div class="rect-dim">${r.line}</div></div>
    </div>
    <div class="muted" style="font-size:12px">相关度 ${r.score.toFixed(1)}：${r.reason}。${r.score >= 0.6 ? "会浮到叠放最上面。" : "留在下面，不打扰。"}</div>
  </div>`;
}

function renderNotices(s: GameState): string {
  const today = s.friendBattles.find((b) => b.date === s.today);
  const friend = today ? FRIENDS.find((f) => f.id === today.friendId) : null;
  const all = noticesFor(s, glanceFacts(s), friend ? (today!.won ? `我切磋赢了${friend.name}！` : `跟${friend.name}切磋了，下次再来`) : undefined);
  const sent = all.filter((n) => channels[n.channel]);
  const held = all.filter((n) => !channels[n.channel]);
  return `<div class="notices">
    ${sent.map((n) => `<div class="notice"><div class="n-head"><span>PULSELING</span><span>${n.time}</span></div><div>${n.text}</div><div class="rect-dim">${n.note}</div></div>`).join("") || '<div class="muted" style="font-size:12px">今天不发通知</div>'}
    ${held.map((n) => `<div class="muted" style="font-size:12px">已关闭「${CHANNEL_NAME[n.channel]}」，不发：${n.text}</div>`).join("")}
    <h3>通知设置</h3>
    ${(Object.keys(CHANNEL_NAME) as Notice["channel"][]).map((c) => `<label class="toggle"><input type="checkbox" data-channel="${c}" ${channels[c] ? "checked" : ""}/> ${CHANNEL_NAME[c]}</label>`).join("")}
    <div class="row" style="margin-top:6px"><span class="muted" style="font-size:12px">模拟离开：</span>${[0, 3, 7].map((d) => `<button class="small ${daysAway === d ? "primary" : ""}" data-act="away" data-v="${d}">${d} 天</button>`).join("")}</div>
    <p class="muted" style="font-size:12px">规则：每天最多 1 条早上的通知，挑最重要的一件事；不超过 25 个字；宠物第一人称；不提连胜、不让人内疚。离开 3 天和 7 天各发一条温柔的，之后不再发。</p>
  </div>`;
}

function battleSummary(r: BattleReport, boss: boolean) {
  const won = r.result.winner === "a";
  return `<div class="row">${canvas(opponentSpec(r, boss))}<div>
    <div>${speciesName(r.opponentName)} ${typePill(r.opponentType as ElementType | null)} ${r.opponentRarity ? `<span class="pill">${rarityLabel(r.opponentRarity)}</span>` : ""} ${r.shiny ? '<span class="pill">✨闪光</span>' : ""}</div>
    <div class="${won ? "good" : "bad"}">${won ? "胜利" : r.result.winner === "draw" ? "平局" : "失败"} · ${r.result.turns} 回合</div>
    <button class="small" data-act="${boss ? "replay-boss" : "replay-trial"}">看回放</button>
  </div></div>`;
}

function renderToday(s: GameState): string {
  const m = s.morning;
  const bossToday = s.boss && s.boss.date === s.today ? s.boss : null;
  return `<div class="stack">
    ${renderMorningCard(s)}
    ${s.pendingLine ? `<div class="card highlight"><p>${s.pendingLine}</p></div>` : ""}
    ${s.letters.length ? `<div class="card ${s.letters[0].read ? "" : "highlight"}"><h2>来信 ${s.letters.some((l) => !l.read) ? '<span class="pill">未读</span>' : ""}</h2>
      ${s.letters.slice(0, 4).map((l) => `<div class="row"><span>${l.date.slice(5)} 的周信</span><button class="small" data-act="letter" data-v="${l.date}">${l.read ? "再看看" : "打开"}</button></div>`).join("")}
    </div>` : ""}
    <div class="card"><h2>今早的试炼</h2>
      ${
        !m
          ? `<p>${hatchLine(s.pet.personality, s.facts)}</p><p class="muted">在右边设置今天的健康数据，然后"过完这一天"。</p>`
          : `<p>${watchLine(s)}</p>
        ${m.encounter ? `<h3>遇到野怪</h3>${battleSummary(m.trial, false)}${m.newSpecies ? `<p class="good">收服成功，图鉴已解锁！${m.newSkill ? `学会了 ${skillName(m.newSkill)}。` : ""}</p>` : m.captured ? `<p class="muted">已经收服过了，得到闪光碎片。</p>` : `<p class="muted">没打赢，图鉴里留下了剪影。</p>`}`
          : `<p class="muted">今天没遇到野怪（${s.daysSinceEncounter} 天没遇到了，连续 4 天没遇到第 5 天必遇）。每日试炼对手是训练假人。</p>${battleSummary(m.trial, false)}`}`
      }
    </div>
    ${s.bossPending ? `<div class="card highlight"><h2>这周的 Boss 来了！</h2><p>${TYPE_NAME[s.bossPending.type as ElementType]}系 Boss 今天一整天都在。手表上点一下开打（开打前蓄力，最多 +6% 伤害）；今天没打，明天会自动打。</p><button class="primary" data-act="boss">现在开打</button></div>` : ""}
    ${bossToday ? `<div class="card"><h2>周 Boss</h2>${battleSummary(bossToday, true)}</div>` : ""}
    ${renderChat(s)}
    <div class="card"><h2>动态</h2><ul class="feed">${s.feed.slice(0, 12).map((f) => `<li><span class="muted">${f.date.slice(5)}</span> ${f.text}</li>`).join("")}</ul></div>
  </div>`;
}

function renderChat(s: GameState): string {
  const left = chatsLeft(s);
  const today = s.chat.log.filter((l) => l.date === s.today);
  const off = left <= 0 || s.trial === "offered" ? "disabled" : "";
  return `<div class="card"><h2>跟它说句话 <span class="muted" style="font-size:12px;font-weight:400">今天还能说 ${left}/${CHATS_PER_DAY} 句</span></h2>
    <div class="chat">${today.map((l) => `<div class="msg ${l.from}">${l.text}</div>`).join("") || '<div class="muted">每天可以跟它说 3 句话。说出口的承诺它会记得，第二天对照你的数据。</div>'}</div>
    <div class="row" style="margin-top:8px">${REPLIES.map((x) => `<button class="small" data-act="chat" data-v="${x.id}" ${off}>${x.label}</button>`).join("")}</div>
    ${s.memories.length ? `<h3>它记得的事</h3><ul class="feed">${s.memories.slice(0, 5).map((mm) => `<li><span class="muted">${mm.date.slice(5)}</span> ${mm.text}</li>`).join("")}</ul>` : ""}
    <p class="muted" style="font-size:12px">原型里是预设回复；正式版用 AI 生成，会结合你的健康数据和记忆。</p>
  </div>`;
}

function gapText(g: EvolutionGap): string {
  if (g.kind === "below") return `${TYPE_NAME[g.type]}倾向 ${pct(g.current)}，需要 ${pct(g.required)}`;
  return `强项 ${g.strongTypes.length}/${g.requiredTypes}，其中运动 ${g.strongExercise}/${g.requiredExercise}`;
}

const VARIANT_HINT: Partial<Record<AdultVariant, string>> = {
  pure: "没有条件，永远可选（不升稀有度）",
  flying: "每周有氧约 90 分钟以上",
  fighting: "每周力量训练约 36 分钟以上",
  ground: "每周大多数天都有活动，常爬楼",
  dragon: "最近 14 天 4 项以上很强，含 2 项运动",
};

function renderPet(s: GameState): string {
  const pet = s.pet;
  const st = status(s);
  const stats = petStats(pet);
  const stageName = { baby: "幼体", juvenile: "成长体", adult: `成熟体 · ${VARIANT_NAME[pet.adultVariant ?? "pure"]}` }[pet.stage];
  let evo = "";
  if (pet.stage === "baby") {
    evo = `<div class="row">${canvas(petSpec(pet, undefined, "juvenile"), "silhouette")}<div>
      <div>下一阶段：成长体</div>
      <div class="muted">进度 ${Math.round(st.progress)} / ${st.threshold} · 已经 ${st.daysInStage} 天（最少 ${st.minDays} 天）</div>
      <div class="muted">${st.earnsRarityUpgrade ? "✓ 最近有运动习惯，进化时稀有度 +1" : "最近 14 天有一项运动习惯达标，进化时稀有度 +1"}</div>
    </div></div>`;
  } else if (pet.stage === "juvenile") {
    evo = `<p class="muted">进度 ${Math.round(st.progress)} / ${st.threshold} · 已经 ${st.daysInStage} 天（最少 ${st.minDays} 天）${st.barFull && !st.ready ? " · 进度满了，等天数" : ""}${st.ready && !st.auto ? " · <b>蓄力中：可以现在进化，或继续为目标努力</b>" : ""}</p>
    <div class="options">${st.options
      .map((o) => {
        const isTarget = pet.target === o.variant;
        return `<div class="option ${isTarget ? "target" : ""}">${canvas(petSpec(pet, o.variant, "adult"))}
          <div><b>${VARIANT_NAME[o.variant]}</b> ${o.met ? '<span class="good">✓ 已达标</span>' : ""}</div>
          <div class="muted">${VARIANT_HINT[o.variant] ?? ""}</div>
          ${o.gaps.map((g) => `<div class="bad">${gapText(g)}</div>`).join("")}
          <div class="row" style="justify-content:center;margin-top:4px">
            <button class="small" data-act="target" data-v="${isTarget ? "" : o.variant}">${isTarget ? "取消目标" : "设为目标"}</button>
            ${st.ready && o.met ? `<button class="small primary" data-act="evolve" data-v="${o.variant}">现在进化</button>` : ""}
          </div></div>`;
      })
      .join("")}</div>`;
  } else {
    evo = `<p class="muted">已经是最终形态。</p>`;
  }
  return `<div class="stack">
    <div class="card"><h2>${stageName}</h2>
      <div class="row">${typesHtml(pet)} <span class="pill">${PERSONALITY_NAME[pet.personality]}</span> ${pet.shiny ? '<span class="pill">✨闪光</span>' : ""}</div>
      <h3>进化</h3>${evo}
    </div>
    <div class="card"><h2>属性</h2>
      <div class="stats">${STATS.map((k) => `<span>${STAT_NAME[k]}</span><div class="meter"><i style="width:${Math.min(100, (stats[k] / 150) * 100)}%"></i></div><span>${Math.round(stats[k])}</span>`).join("")}</div>
      <p class="muted">状态加成 ×${condition(s).toFixed(2)}（最近 3 天睡得好、动得多会提高，只加不减）</p>
      <h3>最近 14 天的成长（每天 10–20）</h3>
      <div class="chart">${s.results.slice(-14).map((x) => `<div class="col" title="${x.date} +${Math.round(x.gain)}"><i style="height:${Math.round((x.gain / 20) * 100)}%"></i><span>${x.date.slice(8)}</span></div>`).join("") || '<span class="muted">还没有数据</span>'}</div>
    </div>
    ${renderCollection(s)}
    <div class="card"><h2>分享</h2>
      <div class="row"><button class="small" data-act="share" data-v="pet">我的宠物</button>${s.bosses.length ? '<button class="small" data-act="share" data-v="boss">最近一次 Boss</button>' : ""}<button class="small" data-act="share" data-v="dex">图鉴</button></div>
      <p class="muted" style="font-size:12px">生成 9:16 竖图，适合发朋友圈和小红书。默认不带任何健康数字。</p>
    </div>
    <div class="card"><h2>稀有度</h2>
      <p>孵化时 <b>${rarityLabel(pet.hatchRarity)}</b> → 现在 <b class="stars">${rarityLabel(pet.rarity)}</b></p>
      <p class="muted">外观：${Object.values(pet.cosmetics).join("、") || "基础造型"}</p>
      <p class="muted">升档：第一次进化有运动习惯 ${pet.rarityUpgrades.includes("juvenile") ? "✓" : "○"} · 第二次进化成真正的形态 ${pet.rarityUpgrades.includes("adult") ? "✓" : "○"} · 累计活跃 ${pet.activeDays}/${ACTIVE_DAYS_FOR_UPGRADE} 天 ${pet.rarityUpgrades.includes("activeDays") ? "✓" : "○"}</p>
      <p class="muted">靠努力最多比孵化时高 2 档；传说只能孵化时抽到。（${RARITIES.map((r) => RARITY_NAME[r]).join(" → ")}）</p>
    </div>
  </div>`;
}

function renderCollection(s: GameState): string {
  const all = Object.values(ITEMS).flat();
  const got = all.filter((i) => s.collection[i]);
  return `<div class="card"><h2>收藏册 ${got.length} / ${all.length}</h2>
    <div class="items">${all.map((i) => `<span class="item ${s.collection[i] ? "" : "locked"}" title="${i}">${s.collection[i] ? `${SURPRISE_ICON.item} ${i}${s.collection[i]! > 1 ? ` ×${s.collection[i]}` : ""}` : "？？"}</span>`).join("")}</div>
    <p class="muted" style="font-size:12px">没遇到野怪的早上会捡到小东西，跟昨天最突出的那件事有关。只是收藏，不加战斗力。</p>
    <h3>会的动作</h3>
    <p>${s.moves.length ? s.moves.map((mv) => MOVE_NAME[mv]).join("、") : '<span class="muted">还没学会，过几天看看</span>'}</p>
  </div>`;
}

const typesHtml = (pet: PetState) => petTypes(pet).map((t) => typePill(t)).join(" ");

function renderDex(s: GameState): string {
  const captured = Object.values(s.dex).filter((e) => e.captured).length;
  return `<div class="card"><h2>图鉴 ${captured} / ${ROSTER.length}</h2>
    <div class="dex">${ROSTER.map((sp) => {
      const e = s.dex[sp.id];
      if (!e) return `<div class="cell" data-act="dex" data-v="${sp.id}" role="button" tabindex="0"><div style="height:48px;line-height:48px" class="muted">?</div><div class="muted">？？？</div></div>`;
      return `<div class="cell" data-act="dex" data-v="${sp.id}" role="button" tabindex="0">${canvas(wildSpec(sp.id, e.shiny), e.captured ? "" : "silhouette")}<div>${e.captured ? speciesName(sp.id) : "剪影"}</div><div class="muted">${rarityLabel(sp.rarity)}</div></div>`;
    }).join("")}</div>
    <h3>从野怪学会的技能</h3><p>${s.learned.map((id) => `${skillName(id)}（${TYPE_NAME[getSkill(id).type!]}）`).join("、") || '<span class="muted">还没有</span>'}</p>
  </div>`;
}

/** Dex detail: how to meet it (which habit draws it in), what it teaches, and where you stand with it. */
const habitHint = (type: string) => (type === "dragon" ? "最近两周有 4 项以上很强（其中 2 项是运动）" : HINT[type as EchoType]);
function renderDexDetail(s: GameState): string {
  const sp = ROSTER.find((x) => x.id === dexOpen);
  if (!sp) return "";
  const e = s.dex[sp.id];
  const type = sp.type as ElementType;
  const body = !e
    ? `<div class="muted" style="font-size:40px">？</div><h2>？？？</h2><p>据说是${TYPE_NAME[type]}系。</p>`
    : `${canvas(wildSpec(sp.id, e.shiny), e.captured ? "" : "silhouette")}<h2>${e.captured ? speciesName(sp.id) : "剪影"}</h2>
       <div class="row" style="justify-content:center">${typePill(type)}<span class="pill">${rarityLabel(sp.rarity)}</span>${e.shiny ? '<span class="pill">✨闪光</span>' : ""}</div>
       <p>${e.captured ? `${e.captured.slice(5)} 收服 · 教会了 <b>${skillName(sp.teaches)}</b>` : `${e.seen.slice(5)} 见过 · 打赢它就能收服，学会一个${TYPE_NAME[type]}系技能`}</p>`;
  return `<div class="modal-bg"><div class="modal stack" style="text-align:center">
    ${body}
    <div class="card" style="text-align:left"><b>怎么遇到它</b><p class="muted" style="margin:4px 0 0">${habitHint(sp.type)}的日子，${TYPE_NAME[type]}系野怪更容易出现。${sp.rarity === "common" ? "" : "它比较少见，多试几天。"}</p></div>
    <button class="small primary" data-act="dex-close">好</button>
  </div></div>`;
}

function nextBossDate(s: GameState): string {
  for (let i = 0; i < 14; i++) if (isBossDay(addDays(s.today, i), s.pet.hatchedOn)) return addDays(s.today, i);
  return s.today;
}

function renderFriends(s: GameState): string {
  return `<div class="card"><h2>好友切磋 <span class="muted" style="font-size:12px;font-weight:400">每位好友每天 1 次 · 输了不掉任何东西</span></h2>
    ${FRIENDS.map((f) => {
      const fs = friendState(s, f);
      const rec = s.friendBattles.filter((b) => b.friendId === f.id);
      const wins = rec.filter((b) => b.won).length;
      const done = foughtFriendToday(s, f.id);
      const stage = { baby: "幼体", juvenile: "成长体", adult: `成熟体·${VARIANT_NAME[fs.pet.adultVariant ?? "pure"]}` }[fs.pet.stage];
      return `<div class="friend">${canvas(petSpec(fs.pet))}<div class="friend-info">
        <div><b>${f.name}</b> ${typesHtml(fs.pet)} <span class="pill">${rarityLabel(fs.pet.rarity)}</span></div>
        <div class="muted">${stage} · 战绩 ${wins} 胜 ${rec.length - wins} 负</div>
        ${matchupHint(s, fs)}
      </div><button class="small ${done ? "" : "primary"}" data-act="friend" data-v="${f.id}" ${done || s.trial === "offered" ? "disabled" : ""}>${done ? "今天切磋过了" : "切磋"}</button>${done && lastFriendReplay?.theirName === f.name ? '<button class="small replay-btn" data-act="replay-friend">看回放</button>' : ""}</div>`;
    }).join("")}
    <p class="muted" style="font-size:12px">打的是好友宠物的"快照"（它昨天同步时的样子），对方不用在线。原型里的三位好友是模拟出来的不同生活习惯的人。你的好友码：PL-${s.userId.slice(-4).toUpperCase()}</p>
  </div>`;
}

/** Explain lopsided pairings up front, so a loss reads as "their type beats mine", not "I'm bad". */
function matchupHint(s: GameState, other: GameState): string {
  const mine = petTypes(s.pet), theirs = petTypes(other.pet);
  const theyHitMe = Math.max(...theirs.map((t) => effectiveness(t, mine)));
  const iHitThem = Math.max(...mine.map((t) => effectiveness(t, theirs)));
  if (theyHitMe > 1 && iHitThem <= 1) {
    const counter = (Object.keys(TYPE_NAME) as ElementType[]).find((t) => effectiveness(t, theirs) > 1);
    return `<div class="bad" style="font-size:12px">它的属性克制你${counter ? `，收服${TYPE_NAME[counter]}系野怪学到克制技能会好打很多` : ""}</div>`;
  }
  if (iHitThem > 1 && theyHitMe <= 1) return '<div class="good" style="font-size:12px">你的属性克制它</div>';
  return "";
}

const BOSS_ID = "__boss";
const chargeTargetName = (s: GameState, id: string) => (id === BOSS_ID ? `${TYPE_NAME[(s.bossPending?.type ?? "fire") as ElementType]}系周 Boss` : FRIENDS.find((x) => x.id === id)!.name);

function renderCharge(): string {
  if (!charging || !state || charging.onWatch) return "";
  const name = chargeTargetName(state, charging.friendId);
  return `<div class="modal-bg"><div class="modal stack" style="text-align:center">
    <h2>${charging.friendId === BOSS_ID ? `挑战${name}` : `跟${name}切磋`}</h2>
    <p class="muted">手表上：标记走到中间时点一下，开场伤害最多 +6%</p>
    <div class="gauge"><div class="gauge-sweet"></div><div class="gauge-mark"></div></div>
    <button class="primary" data-act="charge">蓄力！</button>
  </div></div>`;
}

function renderBattle(s: GameState): string {
  const bossDate = nextBossDate(s);
  const bossType = nextBossType({ ...s, today: bossDate }) as EchoType;
  const known = knownSkills(s.pet, s.learned);
  const loadout = currentLoadout(s);
  const err = validateLoadout(s.pet, loadout, known);
  return `<div class="stack">
    ${renderFriends(s)}
    <div class="card"><h2>本周 Boss</h2>
      <p>${bossDate.slice(5)} 开打 · ${typePill(bossType)} 系 Boss</p>
      <p class="muted">${petTypes(s.pet).some((t) => effectiveness(bossType, [t]) > 1) ? "它克制你的属性，记得带上能克制它的技能。" : petTypes(s.pet).some((t) => effectiveness(t, [bossType]) > 1) ? "你的属性克制它。" : "属性互不相克。"}</p>
    </div>
    <div class="card"><h2>技能配置（选 4 个）</h2>
      <div class="row">${known
        .map((id) => {
          const sk = getSkill(id);
          const on = loadout.includes(id);
          const eff = sk.type ? effectiveness(sk.type, [bossType]) : 1;
          return `<button class="small ${on ? "primary" : ""}" data-act="skill" data-v="${id}">${skillName(id)} ${sk.type ? TYPE_NAME[sk.type] : ""}${eff > 1 ? " ▲" : eff < 1 ? " ▼" : ""}</button>`;
        })
        .join("")}</div>
      <p class="muted">▲ 克制本周 Boss，▼ 被抵抗。至少 2 个本系技能。</p>
      ${err ? `<p class="bad">${err}</p>` : ""}
      <h3>战术</h3><div class="row">${(["aggressive", "balanced", "cautious"] as Tactic[]).map((t) => `<button class="small ${s.tactic === t ? "primary" : ""}" data-act="tactic" data-v="${t}">${TACTIC_NAME[t]}</button>`).join("")}</div>
    </div>
    <div class="card"><h2>历次 Boss</h2>${s.bosses.length ? s.bosses.slice(0, 6).map((b) => `<div>${b.date.slice(5)} ${typePill(b.opponentType as ElementType)} <span class="${b.result.winner === "a" ? "good" : "bad"}">${b.result.winner === "a" ? "胜" : "负"}</span></div>`).join("") : '<p class="muted">还没打过。第一个 Boss 在第 6 天。</p>'}</div>
  </div>`;
}

function renderDev(s: GameState): string {
  return `<div class="card dev"><h2>假健康数据（${s.today.slice(5)}）</h2>
    <div class="presets">${Object.entries(PRESETS).map(([k, p]) => `<button class="small" data-act="preset" data-v="${k}">${p.label}</button>`).join("")}</div>
    <label><span>戴着手表</span><input type="checkbox" data-slider="worn" ${sliders.worn ? "checked" : ""}/><span></span></label>
    ${SLIDERS.map((d) => `<label><span>${d.label}</span><input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${sliders[d.key]}" data-slider="${d.key}"/><span data-out="${d.key}">${d.fmt(sliders[d.key])}</span></label>`).join("")}
    <div class="row" style="margin-top:6px"><span class="muted" style="font-size:12px">模拟刚完成一次运动：</span><button class="small" data-act="workout" data-v="cardio:30">跑步 30 分钟</button><button class="small" data-act="workout" data-v="strength:40">力量 40 分钟</button><button class="small" data-act="workout" data-v="hiit:20">间歇 20 分钟</button></div>
    <div class="row" style="margin-top:10px"><button class="primary" data-act="live">过完这一天</button><button data-act="ff">按"${PERSONA_NAME[(s.persona ?? "walker") as PersonaId]}"快进 7 天</button></div>
    <h3>昨天的回响（跟自己平时比，−1 到 +1）</h3>
    <div class="row">${Object.entries(s.lastEchoes).map(([t, v]) => `<span class="pill">${TYPE_NAME[t as ElementType]} ${(v as number) >= 0 ? "+" : ""}${(v as number).toFixed(2)}</span>`).join("") || '<span class="muted">还没有</span>'}</div>
    <h3>一天的作息</h3>
    <label style="grid-template-columns:76px 1fr 64px"><span>模拟时间</span><input type="range" min="-15" max="1425" step="15" value="${timeOverride ?? -15}" data-time="1"/><span>${timeOverride === null ? "现在" : fmtClock(timeOverride)}</span></label>
    <p class="muted" style="font-size:12px">它跟着你平时的作息：${(() => { const w = sleepWindow(s.history); return `${fmtClock(w.bed)} 睡、${fmtClock(w.wake)} 醒`; })()}。现在：${{ morning: "刚起床", day: "白天", winddown: "快睡觉了", sleep: "睡着了" }[phaseOf(s)]}</p>
    <h3>辅助功能</h3>
    <label style="grid-template-columns:auto 1fr"><input type="checkbox" data-a11y="reduce" ${forceReduce ? "checked" : ""}/><span>模拟"减弱动态效果"（系统设置开了也会生效）</span></label>
    <h3>原型说明</h3>
    <p class="muted" style="font-size:12px">游戏规则全部来自 packages/engine（和服务器以后用的是同一套）。宠物说的话是模板，以后换成 AI。进度存在浏览器里。</p>
    <button class="small" data-act="reset">重新开始</button>
  </div>`;
}

const FIELD_NAME: Record<string, string> = {
  worn: "戴着手表", steps: "步数", standHours: "站立小时", activeEnergyKcal: "活动能量（千卡）", flightsClimbed: "爬楼层数",
  sleepMinutes: "睡眠（分钟）", bedtimeMinutes: "入睡时间（相对午夜，分钟）", deepSleepRatio: "深睡比例", nightHrvMs: "夜间 HRV 平均（毫秒）",
  restingHr: "静息心率", cardioMinutes: "有氧（分钟）", distanceKm: "距离（公里）", strengthMinutes: "力量（分钟）",
  highIntensityMinutes: "高强度（分钟）", intervalMinutes: "间歇（分钟）", highHrZoneMinutes: "高心率区间（分钟）",
};

function renderData(s: GameState): string {
  const last = [...s.history].reverse().find((d) => d.date < s.today);
  const rows = last ? Object.entries(last).filter(([k]) => k !== "date").map(([k, v]) => `<tr><td>${FIELD_NAME[k] ?? k}</td><td>${typeof v === "number" ? Math.round(v * 100) / 100 : v ? "是" : "否"}</td></tr>`).join("") : "";
  return `<div class="stack"><div class="card"><h2>我们上传了什么</h2>
    <p class="muted">这就是每天上传到服务器的全部内容：一行每日汇总。心率明细、睡眠各阶段的原始记录都留在你的手机上，只上传算好的结果；不上传位置。</p>
    ${last ? `<h3>${last.date} 上传的数据</h3><table class="kv">${rows}</table>` : '<p class="muted">还没有上传过。</p>'}
    <p class="muted">运动记录还会上传每次一行摘要（类型、开始时间、时长、距离、平均心率），不含 GPS 路线。</p>
    <button data-act="reset">删除全部数据</button>
  </div></div>`;
}

function renderLetter(s: GameState): string {
  const l = s.letters.find((x) => x.date === openLetter);
  if (!l) return "";
  return `<div class="modal-bg"><div class="modal letter">
    <h2>来自你的 Pulseling · ${l.date.slice(5)}</h2>
    <div class="row" style="justify-content:center">${canvas(petSpec(s.pet))}</div>
    <p style="white-space:pre-wrap">${l.text}</p>
    <div class="row" style="justify-content:flex-end"><button class="small primary" data-act="close-letter">收好</button></div>
  </div></div>`;
}

function renderPaywall(s: GameState): string {
  const st = status(s);
  return `<div class="modal-bg"><div class="modal stack" style="text-align:center">
    <h2>它想继续长大</h2>
    <div>${canvas(petSpec(s.pet, undefined, "juvenile"), "silhouette")}</div>
    <p>进化进度 ${pct(Math.min(1, st.progress / st.threshold))}，它会变成这样……</p>
    <p class="muted">开启 7 天免费试用，陪它继续长大。试用结束前一天提醒你，可以随时取消。</p>
    <button class="primary" data-act="trial-start">开启 7 天免费试用</button>
    <button data-act="trial-later">暂时不用（它会冬眠，不会消失）</button>
  </div></div>`;
}

function eventText(e: BattleEvent, mine: string, theirs: string): string {
  const who = e.actor === "a" ? mine : theirs;
  const sk = skillName(e.skill);
  if (e.kind === "heal") return `${who} 使用 ${sk}，回复 ${e.heal}`;
  if (e.kind === "shield") return `${who} 使用 ${sk}，接下来受到的伤害减半`;
  if (e.kind === "slow") return `${who} 使用 ${sk}，对方变慢了`;
  if (e.dodged) return `${who} 使用 ${sk}……被躲开了！`;
  const eff = e.effectiveness ?? 1;
  return `${who} 使用 ${sk}${e.kind === "ultimate" ? "（大招）" : ""}，造成 ${e.damage} 伤害${eff > 1 ? "，效果拔群！" : eff < 1 ? "，效果不太好" : ""}${e.crit ? "（暴击）" : ""}`;
}

/** Battle replay poses: attacker attacks, target flinches; the winner cheers, the loser just pants (no "failure" drama). */
function actionFor(e: BattleEvent | undefined, side: "a" | "b", done: boolean, winner: string): SpriteAction {
  if (done) return winner === side ? "happy" : winner === "draw" ? "idle" : "sleepy";
  if (!e) return "idle";
  const support = e.kind === "heal" || e.kind === "shield" || e.kind === "slow";
  if (e.actor === side) return support ? "happy" : "attack";
  return support || e.dodged ? "idle" : "hit";
}

/**
 * Visual replay (07 §3, game-feel research): both pets on a stage, one consistent damage signal (a floating number
 * over the target, yellow when super effective, bigger on crits), shake only on crits and ultimates, 1×/2× speed,
 * and an end card naming the key moment. The text log is still there, folded.
 */
function popFor(e: BattleEvent | undefined): string {
  if (!e) return "";
  const target = e.kind === "heal" || e.kind === "shield" ? e.actor : e.actor === "a" ? "b" : "a";
  const side = target === "a" ? "left" : "right";
  let text = "", cls = "";
  if (e.kind === "heal") { text = `+${e.heal}`; cls = "heal"; }
  else if (e.kind === "shield") { text = "护盾"; cls = "info"; }
  else if (e.kind === "slow") { text = "变慢"; cls = "info"; }
  else if (e.dodged) { text = "闪避"; cls = "info"; }
  else {
    const eff = e.effectiveness ?? 1;
    text = `${e.damage}`;
    cls = `dmg${eff > 1 ? " super" : eff < 1 ? " weak" : ""}${e.crit ? " crit" : ""}`;
  }
  const tag = e.kind === "ultimate" ? '<div class="pop-tag">大招！</div>' : (e.effectiveness ?? 1) > 1 && !e.dodged && e.damage ? '<div class="pop-tag">效果拔群</div>' : e.crit ? '<div class="pop-tag">暴击</div>' : "";
  return `<div class="pop ${side} ${cls}">${tag}${text}</div>`;
}

function shareCardFor(s: GameState, kind: "pet" | "boss" | "dex"): ShareCard {
  const pet = s.pet;
  const stage = { baby: "幼体", juvenile: "成长体", adult: `成熟体·${VARIANT_NAME[pet.adultVariant ?? "pure"]}` }[pet.stage];
  const captured = Object.values(s.dex).filter((e) => e.captured).length;
  const bossWins = s.bosses.filter((b) => b.result.winner === "a").length;
  const week = s.history.slice(-7).filter((d): d is typeof d & { worn: true } => d.worn);
  const steps = week.reduce((a, d) => a + (d.steps ?? 0), 0);
  const spec = petSpec(pet, undefined, undefined, "happy");
  if (kind === "boss" && s.bosses[0]) {
    const b = s.bosses[0];
    const won = b.result.winner === "a";
    return { spec, kicker: `${b.date.slice(5)} · 周 Boss`, flex: won ? "打赢了 Boss！" : "差一点！", lines: [`${TYPE_NAME[b.opponentType as ElementType]}系 Boss · ${b.result.turns} 回合`, keyMoment(b, speciesName(b.opponentName))], privateLine: `这周走了 ${steps.toLocaleString()} 步` };
  }
  if (kind === "dex") {
    return { spec, kicker: "我的图鉴", flex: `收集了 ${captured} 只`, lines: [`共 ${ROSTER.length} 只 · 还差 ${ROSTER.length - captured} 只`, `第 ${dayNumber(s)} 天`], privateLine: `这周走了 ${steps.toLocaleString()} 步` };
  }
  return { spec, kicker: `第 ${dayNumber(s)} 天 · ${rarityLabel(pet.rarity)}`, flex: stage, lines: [`${petTypes(pet).map((t) => TYPE_NAME[t] + "系").join(" · ")} · ${PERSONALITY_NAME[pet.personality]}`, `图鉴 ${captured} 只 · 打赢 Boss ${bossWins} 次`], privateLine: `这周走了 ${steps.toLocaleString()} 步` };
}

function renderShare(): string {
  return `<div class="modal-bg"><div class="modal stack share-modal" style="text-align:center">
    <canvas class="share-preview" width="1080" height="1920"></canvas>
    <label class="toggle" style="justify-content:center"><input type="checkbox" data-share-private="1" ${shareOpen?.includePrivate ? "checked" : ""}/> 加上我的健康数据（默认不加）</label>
    <div class="row" style="justify-content:center"><button class="primary small" data-act="share-save">保存图片</button><button class="small" data-act="share-close">关闭</button></div>
  </div></div>`;
}

async function paintShare() {
  const c = app.querySelector<HTMLCanvasElement>(".share-preview");
  if (!c || !shareOpen || !state) return;
  await renderShareCard(c, shareCardFor(state, shareOpen.kind), shareOpen.includePrivate);
}

function keyMoment(r: BattleReport, theirs: string): string {
  const hits = r.result.log.filter((e) => (e.damage ?? 0) > 0);
  if (!hits.length) return "";
  const best = hits.reduce((a, b) => ((b.damage ?? 0) > (a.damage ?? 0) ? b : a));
  const who = best.actor === "a" ? "我" : theirs;
  const why = best.kind === "ultimate" ? "大招" : (best.effectiveness ?? 1) > 1 ? "克制" : best.crit ? "暴击" : "一击";
  return `关键一击：${who}的${skillName(best.skill)}（${why}）${best.damage} 伤害`;
}

function renderReplay(): string {
  if (!replay || !state) return "";
  const { report, step } = replay;
  const log = report.result.log.slice(0, step);
  const last = log[log.length - 1];
  const hp = last?.hp ?? report.result.maxHp;
  const done = step >= report.result.log.length;
  const theirs = replay.theirName ?? speciesName(report.opponentName);
  const won = report.result.winner === "a";
  const shake = last && !reduceMotion() && (last.crit || last.kind === "ultimate") && !last.dodged ? "shake" : "";
  const bar = (i: 0 | 1) => `<div class="hp"><i style="width:${pct(hp[i] / report.result.maxHp[i])}"></i></div>`;
  return `<div class="modal-bg"><div class="modal replay">
    <h2>${replay.title ?? (replay.boss ? "周 Boss" : "每日试炼")} · ${report.date.slice(5)}</h2>
    <div class="stage ${shake}" data-step="${step}">
      <div class="fighter left"><div class="fname">我的宠物</div>${bar(0)}${canvas({ ...replay.mine, action: actionFor(last, "a", done, report.result.winner) })}</div>
      <div class="vs">${done ? "" : `第 ${last?.turn ?? 1} 回合`}</div>
      <div class="fighter right"><div class="fname">${theirs}</div>${bar(1)}${canvas({ ...replay.theirs, action: actionFor(last, "b", done, report.result.winner) }, "flip")}</div>
      ${done ? "" : popFor(last)}
      ${done ? `<div class="end ${won ? "win" : ""}">${won ? "胜利！" : report.result.winner === "draw" ? "平局" : "差一点！明天再来"}<div class="end-sub">${report.result.turns} 回合 · ${keyMoment(report, theirs)}</div></div>` : ""}
    </div>
    <details class="battle-details"><summary>文字记录</summary><div class="battle-log">${log.map((e) => `<div>第 ${e.turn} 回合：${eventText(e, "我", theirs)}</div>`).join("")}</div></details>
    <div class="row" style="margin-top:10px;justify-content:flex-end">
      ${done ? '<button class="small" data-act="replay-again">再看一遍</button>' : `<button class="small" data-act="replay-speed">${replaySpeed === 1 ? "2× 速" : "1× 速"}</button><button class="small" data-act="skip">跳到结果</button>`}
      <button class="small primary" data-act="close-replay">关闭</button>
    </div>
  </div></div>`;
}

let replayClockFor: ReplayState | null = null;
function render() {
  if (replay && replay !== replayClockFor) { replayClockFor = replay; startReplayClock(); }
  if (!replay) replayClockFor = null;
  if (!state) {
    app.innerHTML = renderStart();
  } else {
    const s = state;
    const body = { today: renderToday, pet: renderPet, dex: renderDex, battle: renderBattle, data: renderData }[tab](s);
    app.innerHTML = `<div class="top"><h1>Pulseling 原型</h1><span class="muted">第 ${dayNumber(s)} 天</span><span class="spacer"></span>${s.trial === "active" ? '<span class="pill">试用中</span>' : ""}</div>
      <div class="layout">
        ${renderWatch(s)}
        <div><div class="tabs">${(["today", "pet", "dex", "battle", "data"] as Tab[]).map((t) => `<button class="${tab === t ? "on" : ""}" data-act="tab" data-v="${t}">${{ today: "今天", pet: "宠物", dex: "图鉴", battle: "对战", data: "数据" }[t]}</button>`).join("")}</div>${body}</div>
        ${renderDev(s)}
      </div>
      ${s.trial === "offered" && !replay && !paywallHidden ? renderPaywall(s) : ""}
      ${renderCharge()}
      ${renderReplay()}
      ${openLetter ? renderLetter(s) : ""}
      ${shareOpen ? renderShare() : ""}
      ${dexOpen ? renderDexDetail(s) : ""}`;
  }
  drawAll();
  if (shareOpen) void paintShare();
}

function drawAll() {
  app.querySelectorAll<HTMLCanvasElement>("canvas[data-sprite]").forEach((c) => {
    const spec = JSON.parse(decodeURIComponent(c.dataset.sprite!)) as SpriteSpec;
    if (c.classList.contains("aod-pet")) return drawSprite(c, { ...spec, frame: 0 });
    if (c.classList.contains("pet-tap") && state) spec.action = liveAction(state);
    // Reduce Motion: one still pose (frame 1 avoids the blink frame); actions still change the pose.
    drawSprite(c, { ...spec, frame: reduceMotion() ? 1 : frame });
  });
}

/** Queue the big-event shows for whatever changed between two states (07 §3). */
function queueShows(prev: GameState | null, s: GameState) {
  const pet = s.pet;
  if (!prev) {
    queueShow({ kind: "hatch", egg: { primary: pet.starter, stage: "egg" }, pet: petSpec(pet), title: `孵化了！${TYPE_NAME[pet.starter]}系 · ${rarityLabel(pet.rarity)}`, lines: [hatchLine(pet.personality, s.facts), `性格：${PERSONALITY_NAME[pet.personality]}`] });
    return;
  }
  const rarityUp = pet.rarity !== prev.pet.rarity;
  if (pet.stage !== prev.pet.stage) {
    const name = pet.stage === "juvenile" ? "成长体" : `成熟体 · ${VARIANT_NAME[pet.adultVariant ?? "pure"]}`;
    const before = petStats(prev.pet), after = petStats(pet);
    const best = STATS.map((k) => [k, after[k] - before[k]] as const).sort((a, b) => b[1] - a[1])[0]!;
    queueShow({ kind: "evolve", from: petSpec(prev.pet), to: petSpec(pet), title: `进化成了${name}！`, lines: [`${STAT_NAME[best[0]]}涨得最多：+${Math.round(best[1])}`, rarityUp ? "稀有度也提升了！" : "外观变了，记得去图鉴看看新样子"] });
  }
  if (rarityUp) queueShow({ kind: "rarity", pet: petSpec(pet), from: prev.pet.rarity, to: pet.rarity, title: `稀有度提升到 ${rarityLabel(pet.rarity)}`, lines: ["长出了新的外观：" + (Object.values(pet.cosmetics).join("、") || "更亮的光")] });
  const m = s.morning;
  if (m && m.date !== prev.morning?.date && m.newSpecies) {
    queueShow({ kind: "capture", wild: wildSpec(m.trial.opponentName, m.trial.shiny), title: `收服了${speciesName(m.trial.opponentName)}！`, lines: [m.newSkill ? `学会了新技能：${skillName(m.newSkill)}` : "图鉴又多了一页", m.trial.opponentRarity ? rarityLabel(m.trial.opponentRarity) : ""].filter(Boolean) });
  }
}

function update(next: GameState | null) {
  if (next && next !== state) queueShows(state, next);
  state = next;
  if (state) save(state);
  if (state?.morning && state.morning.date !== seenMorning) {
    seenMorning = state.morning.date;
    const st = status(state);
    const card = morningCard(state, st.progress, st.threshold);
    if (card) playWatchCard(card);
    else showBubble(shortLine(state));
  }
  render();
}

function openReplay(report: BattleReport, boss: boolean) {
  if (!state) return;
  replay = { report, boss, step: 0, mine: petSpec(state.pet), theirs: opponentSpec(report, boss) };
  render();
}

app.addEventListener("click", (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (!el) return;
  const v = el.dataset.v ?? "";
  switch (el.dataset.act) {
    case "starter": setup.starter = v as Starter; return render();
    case "persona": setup.persona = v as PersonaId; return render();
    case "ob-next": setup.step = v as typeof setup.step; return render();
    case "ob-sheet": setup.step = "sheet"; return render();
    case "ob-allow":
    case "ob-deny": {
      setup.denied = el.dataset.act === "ob-deny";
      setup.pending = newGame(setup.starter, setup.persona, undefined, undefined, setup.denied);
      setup.step = "reading";
      render();
      setTimeout(() => {
        const next = setup.pending;
        setup = { ...setup, step: "egg", pending: null };
        if (next) update(next);
      }, 3600);
      return;
    }
    case "tab": tab = v as Tab; return render();
    case "preset": sliders = { ...PRESETS[v]!.v }; return render();
    case "live": return update(liveDay(state!, toDayInput(sliders)));
    case "ff": {
      let s = state!;
      for (let i = 0; i < 7 && s.trial !== "offered"; i++) s = liveDay(s, personaDay(s, s.pet.starter, s.today));
      return update(s);
    }
    case "reset": if (confirm("重新开始会清空当前进度，确定吗？")) { clearSave(); tab = "today"; update(null); } return;
    case "target": return update(setTarget(state!, (v || undefined) as AdultVariant | undefined));
    case "evolve": return update(chooseEvolution(state!, v as AdultVariant));
    case "trial-start": return update(startTrial(state!));
    case "trial-later": paywallHidden = true; return render();
    case "wake": paywallHidden = false; return render();
    case "replay-trial": return state?.morning ? openReplay(state.morning.trial, false) : undefined;
    case "replay-boss": return state?.boss ? openReplay(state.boss, true) : undefined;
    case "skip": if (replay) replay.step = replay.report.result.log.length; clearInterval(replayTimer); return render();
    case "replay-speed": replaySpeed = replaySpeed === 1 ? 2 : 1; startReplayClock(); return render();
    case "replay-again": if (replay) { replay.step = 0; startReplayClock(); } return render();
    case "close-replay": replay = null; clearInterval(replayTimer); return render();
    case "skill": {
      const cur = currentLoadout(state!);
      const id = v as SkillId;
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < 4 ? [...cur, id] : [...cur.slice(1), id];
      return update(setLoadout(state!, next, state!.tactic));
    }
    case "tactic": return update(setLoadout(state!, currentLoadout(state!), v as Tactic));
    case "chat": {
      const label = REPLIES.find((x) => x.id === v)?.label ?? v;
      const next = chat(state!, v as ReplyId, label);
      update(next);
      const lastLine = next.chat.log[next.chat.log.length - 1];
      if (lastLine?.from === "pet" && next !== state) {
        showBubble(lastLine.text.length > 12 ? lastLine.text.slice(0, 11) + "…" : lastLine.text);
        render();
      }
      return;
    }
    case "letter": openLetter = v; return update(readLetter(state!, v));
    case "close-letter": openLetter = null; return render();
    case "pet-tap": break;
    case "aod": aod = !aod; return render();
    case "dex": dexOpen = v; return render();
    case "dex-close": dexOpen = null; return render();
    case "share": shareOpen = { kind: v as "pet" | "boss" | "dex", includePrivate: false }; render(); return void paintShare();
    case "share-close": shareOpen = null; return render();
    case "share-save": {
      const c = app.querySelector<HTMLCanvasElement>(".share-preview");
      if (!c) return;
      const a = document.createElement("a");
      a.href = c.toDataURL("image/png");
      a.download = `pulseling-${shareOpen?.kind ?? "card"}.png`;
      a.click();
      return;
    }
    case "workout": {
      const [kind, min] = v.split(":") as [WorkoutKind, string];
      const minutes = Number(min);
      sliders[kind] = Math.min(kind === "hiit" ? 60 : 120, sliders[kind] + minutes);
      if (kind === "cardio") sliders.steps = Math.min(20000, sliders.steps + minutes * 140);
      lastWorkout = { kind, minutes, at: performance.now() };
      aod = false;
      heart = true;
      showBubble(`${WORKOUT_NAME[kind]} ${minutes} 分钟！辛苦啦`);
      render();
      setTimeout(() => { heart = false; render(); }, 1600);
      return;
    }
    case "glance": glanceTab = v as typeof glanceTab; return render();
    case "stack-hour": stackHour = Number(v); return render();
    case "away": daysAway = Number(v); return render();
    case "friend": charging = { friendId: v, start: performance.now() }; render(); return animateGauge();
    case "w-boss": charging = { friendId: BOSS_ID, start: performance.now(), onWatch: true }; render(); return animateGauge();
    case "boss": charging = { friendId: BOSS_ID, start: performance.now() }; render(); return animateGauge();
    case "w-friend": charging = { friendId: v, start: performance.now(), onWatch: true }; render(); return animateGauge();
    case "w-result": watchResult = null; return render();
    case "wpage": watchPage = v as WatchPage; watchResult = null; return render();
    case "replay-friend": if (lastFriendReplay) replay = { ...lastFriendReplay, step: 0 }; return render();
    case "charge": {
      if (!charging || !state) return;
      const f = FRIENDS.find((x) => x.id === charging!.friendId)!; // undefined for the boss, handled below
      const pos = chargePos(performance.now() - charging.start);
      const charge = Math.max(0, 1 - Math.abs(pos - 0.5) * 2.5);
      const onWatch = charging.onWatch;
      if (charging.friendId === BOSS_ID) {
        charging = null;
        const next = fightBoss(state, charge);
        const b = next.boss!;
        update(next);
        const bossReplay: ReplayState = { report: b, boss: true, step: 0, mine: petSpec(next.pet), theirs: opponentSpec(b, true), title: `周 Boss · 蓄力 ${Math.round(charge * 100)}%` };
        if (onWatch) watchResult = b.result.winner === "a" ? "赢了 Boss！" : "Boss 好强…";
        else replay = bossReplay;
        return render();
      }
      charging = null;
      const other = friendState(state, f);
      const { state: next, report } = fightFriend(state, f, charge);
      lastFriendReplay = { report, boss: false, step: 0, mine: petSpec(next.pet), theirs: petSpec(other.pet), title: `切磋 · ${f.name} · 蓄力 ${Math.round(charge * 100)}%`, theirName: f.name };
      update(next);
      if (onWatch) watchResult = report.result.winner === "a" ? `赢了${f.name}！` : `${f.name}好强…`;
      else replay = { ...lastFriendReplay };
      return render();
    }
    case "wc-next": clearInterval(watchCardTimer); watchCardTimer = setInterval(nextWatchScreen, 1300); return nextWatchScreen();
    case "mc-skip": el.classList.add("skip"); el.querySelector(".mc-hint")?.remove(); return;
  }
});

app.addEventListener("click", (ev) => {
  if ((ev.target as HTMLElement).classList.contains("pet-tap") && state) {
    if (phaseOf(state) === "sleep") {
      // asleep: no wake-up, no heart, just a whisper
      showBubble("zzz…（你也早点睡）");
      return render();
    }
    heart = true;
    const moves = state.moves;
    moveAnim = moves.length ? moves[Math.floor(Math.random() * moves.length)]! : null;
    showBubble(moveAnim && Math.random() < 0.5 ? `（${MOVE_NAME[moveAnim]}）` : shortLine(state));
    setTimeout(() => { moveAnim = null; }, 900);
    render();
    setTimeout(() => { heart = false; render(); }, 900);
  }
});

function animateGauge() {
  const mark = app.querySelector<HTMLElement>(".gauge-mark");
  if (!charging || !mark) return;
  mark.style.left = `calc(${(chargePos(performance.now() - charging.start) * 100).toFixed(1)}% - 3px)`;
  requestAnimationFrame(animateGauge);
}

let crownAt = 0;
app.addEventListener("wheel", (ev) => {
  const w = (ev.target as HTMLElement).closest("[data-crown]");
  if (!w || charging?.onWatch) return;
  ev.preventDefault();
  if (performance.now() - crownAt < 350) return;
  crownAt = performance.now();
  const i = WATCH_PAGES.indexOf(watchPage) + (ev.deltaY > 0 ? 1 : -1);
  if (i < 0 || i >= WATCH_PAGES.length) return;
  watchPage = WATCH_PAGES[i]!;
  watchResult = null;
  render();
}, { passive: false });

app.addEventListener("input", (ev) => {
  const el = ev.target as HTMLInputElement;
  const key = el.dataset.slider;
  if (el.dataset.sharePrivate) {
    if (shareOpen) shareOpen.includePrivate = el.checked;
    return void paintShare();
  }
  if (el.dataset.time) {
    const v = Number(el.value);
    timeOverride = v < 0 ? null : v;
    return render();
  }
  if (el.dataset.a11y === "reduce") {
    forceReduce = el.checked;
    localStorage.setItem(RM_KEY, forceReduce ? "1" : "0");
    applyReduceMotion();
    return render();
  }
  if (el.dataset.channel) {
    channels = { ...channels, [el.dataset.channel]: el.checked };
    try { localStorage.setItem(CHANNELS_KEY, JSON.stringify(channels)); } catch { /* ignore */ }
    return render();
  }
  if (!key) return;
  if (key === "worn") sliders.worn = el.checked;
  else {
    const k = key as SliderKey;
    sliders[k] = Number(el.value);
    const out = app.querySelector(`[data-out="${k}"]`);
    if (out) out.textContent = SLIDERS.find((d) => d.key === k)!.fmt(sliders[k]);
  }
});

let lastClock = clockNow();
setInterval(() => {
  frame++;
  if (clockNow() !== lastClock) {
    lastClock = clockNow();
    app.querySelectorAll(".clock, .aod-time").forEach((c) => (c.textContent = lastClock));
  }
  drawAll();
}, 500);

applyReduceMotion();
matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", () => { applyReduceMotion(); render(); });
render();
