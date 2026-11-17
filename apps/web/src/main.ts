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
  chooseEvolution,
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
  save,
  setLoadout,
  setTarget,
  startTrial,
  status,
  type BattleReport,
  type DayInput,
  type GameState,
} from "./game";
import { drawSprite, PALETTES, type SpriteSpec } from "./sprites";
import {
  hatchLine,
  moodOf,
  morningLine,
  PERSONALITY_NAME,
  RARITY_NAME,
  skillName,
  speciesName,
  STAT_NAME,
  TACTIC_NAME,
  TYPE_NAME,
  VARIANT_NAME,
} from "./text";
import "@fontsource/fusion-pixel-12px-proportional-sc";

type Tab = "today" | "pet" | "dex" | "battle";
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
let setup: { starter: Starter; persona: PersonaId } = { starter: "fire", persona: "walker" };
let sliders: Sliders = { ...PRESETS.normal!.v };
let replay: { report: BattleReport; mine: Omit<SpriteSpec, "frame">; theirs: Omit<SpriteSpec, "frame">; step: number; boss: boolean } | null = null;
let frame = 0;
let heart = false;
let bubble: string | null = null;
let bubbleTimer: ReturnType<typeof setTimeout> | undefined;
let seenMorning = state?.morning?.date ?? null;
let paywallHidden = false;

const app = document.getElementById("app")!;

const enc = (spec: Omit<SpriteSpec, "frame">) => encodeURIComponent(JSON.stringify(spec));
const canvas = (spec: Omit<SpriteSpec, "frame">, cls = "") => `<canvas data-sprite="${enc(spec)}" class="${cls}"></canvas>`;
const typePill = (t: ElementType | null) => (t ? `<span class="pill type" style="background:${PALETTES[t].main}">${TYPE_NAME[t]}</span>` : `<span class="pill">无属性</span>`);
const pct = (x: number) => `${Math.round(x * 100)}%`;

function petSpec(pet: PetState, variant: AdultVariant | undefined = pet.adultVariant, stage: PetState["stage"] = pet.stage, mood?: SpriteSpec["mood"]): Omit<SpriteSpec, "frame"> {
  const secondary = stage === "adult" && variant && variant !== "pure" ? (variant as ElementType) : null;
  return { primary: pet.starter, secondary, stage, variant: stage === "adult" ? variant ?? "pure" : undefined, shiny: pet.shiny, cosmetics: pet.cosmetics, mood };
}

const wildSpec = (id: string, shiny = false): Omit<SpriteSpec, "frame"> => {
  const sp = ROSTER.find((s) => s.id === id);
  return { primary: (sp?.type ?? "grass") as ElementType, stage: "wild", shiny };
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
  return `<div class="start stack">
    <h1>Pulseling 原型</h1>
    <p class="muted">选一只初始宠物，再选"过去一个月的你"——孵化时会读取这 28 天的模拟健康数据。</p>
    <div class="card"><h2>初始宠物</h2><div class="choices">
      ${(["grass", "water", "fire"] as Starter[])
        .map((t) => `<div class="choice ${setup.starter === t ? "on" : ""}" data-act="starter" data-v="${t}">${canvas({ primary: t, stage: "baby" })}<div>${TYPE_NAME[t]}</div></div>`)
        .join("")}
    </div></div>
    <div class="card"><h2>过去一个月的你</h2><div class="personas">
      ${PERSONAS.map((p) => `<button class="${setup.persona === p.id ? "primary" : ""}" data-act="persona" data-v="${p.id}">${PERSONA_NAME[p.id]}</button>`).join("")}
    </div></div>
    <button class="primary" data-act="hatch">孵化</button>
  </div>`;
}

const SHORT_GREETING: Record<PetState["personality"], string> = { genki: "元气满满！", tsundere: "哼，早。", gentle: "早安～", chuuni: "吾已苏醒。", chill: "早……" };

/** One short line for the watch bubble (about 10 characters). The full sentence lives on the phone. */
function shortLine(s: GameState): string {
  if (s.trial === "offered") return "zzz……";
  const st = status(s);
  if (st.ready && !st.auto) return "我好像要进化了！";
  const m = s.morning;
  if (!m) return "你好呀！";
  if (s.boss && s.boss.date === s.today) return s.boss.result.winner === "a" ? "打赢 Boss 啦！" : "Boss 好强……";
  const name = speciesName(m.trial.opponentName);
  if (m.encounter && m.newSpecies) return `收服了${name}！`;
  if (m.encounter && m.captured) return `又碰到${name}了`;
  if (m.encounter) return `${name}跑掉了…`;
  const mood = currentMood(s);
  if (mood === "sleepy") return "好困……";
  if (mood === "bored") return "想出去走走～";
  return SHORT_GREETING[s.pet.personality];
}

/** Something worth a look: evolution waiting for a choice. */
function needsAttention(s: GameState): boolean {
  const st = status(s);
  return s.trial !== "offered" && st.ready && !st.auto;
}

function showBubble(text: string) {
  bubble = text;
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    bubble = null;
    render();
  }, 4000);
}

const clockNow = () => new Date().toTimeString().slice(0, 5);

function renderWatch(s: GameState): string {
  const st = status(s);
  const asleep = s.trial === "offered";
  const nearEvolution = st.threshold > 0 && st.progress / st.threshold >= 0.85;
  const spec = { ...petSpec(s.pet, undefined, undefined, asleep ? "sleepy" : currentMood(s)), glow: nearEvolution && !asleep };
  return `<div class="watch-wrap">
    <div class="watch">
      <div class="clock">${clockNow()}</div>
      ${needsAttention(s) && !bubble ? '<div class="attn">!</div>' : ""}
      ${bubble ? `<div class="bubble">${bubble}</div>` : ""}
      ${canvas(spec, "pet-tap")}
      ${heart ? '<div class="heart">♥</div>' : ""}
    </div>
    ${asleep ? '<button class="small" data-act="wake">叫醒它</button>' : '<div class="muted" style="font-size:12px">点宠物看它想说什么</div>'}
  </div>`;
}

function battleSummary(r: BattleReport, boss: boolean) {
  const won = r.result.winner === "a";
  return `<div class="row">${canvas(opponentSpec(r, boss))}<div>
    <div>${speciesName(r.opponentName)} ${typePill(r.opponentType as ElementType | null)} ${r.opponentRarity ? `<span class="pill">${RARITY_NAME[r.opponentRarity]}</span>` : ""} ${r.shiny ? '<span class="pill">✨闪光</span>' : ""}</div>
    <div class="${won ? "good" : "bad"}">${won ? "胜利" : r.result.winner === "draw" ? "平局" : "失败"} · ${r.result.turns} 回合</div>
    <button class="small" data-act="${boss ? "replay-boss" : "replay-trial"}">看回放</button>
  </div></div>`;
}

function renderToday(s: GameState): string {
  const m = s.morning;
  const bossToday = s.boss && s.boss.date === s.today ? s.boss : null;
  return `<div class="stack">
    <div class="card"><h2>早上开奖</h2>
      ${
        !m
          ? `<p>${hatchLine(s.pet.personality, s.facts)}</p><p class="muted">在右边设置今天的健康数据，然后"过完这一天"。</p>`
          : `<p>${watchLine(s)}</p>
        ${m.encounter ? `<h3>遇到野怪</h3>${battleSummary(m.trial, false)}${m.newSpecies ? `<p class="good">收服成功，图鉴已解锁！${m.newSkill ? `学会了 ${skillName(m.newSkill)}。` : ""}</p>` : m.captured ? `<p class="muted">已经收服过了，得到闪光碎片。</p>` : `<p class="muted">没打赢，图鉴里留下了剪影。</p>`}`
          : `<p class="muted">今天没遇到野怪（${s.daysSinceEncounter} 天没遇到了，连续 4 天没遇到第 5 天必遇）。每日试炼对手是训练假人。</p>${battleSummary(m.trial, false)}`}`
      }
    </div>
    ${bossToday ? `<div class="card"><h2>周 Boss</h2>${battleSummary(bossToday, true)}</div>` : ""}
    <div class="card"><h2>动态</h2><ul class="feed">${s.feed.slice(0, 12).map((f) => `<li><span class="muted">${f.date.slice(5)}</span> ${f.text}</li>`).join("")}</ul></div>
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
    </div>
    <div class="card"><h2>稀有度</h2>
      <p>孵化时 <b>${RARITY_NAME[pet.hatchRarity]}</b> → 现在 <b>${RARITY_NAME[pet.rarity]}</b></p>
      <p class="muted">外观：${Object.values(pet.cosmetics).join("、") || "基础造型"}</p>
      <p class="muted">升档：第一次进化有运动习惯 ${pet.rarityUpgrades.includes("juvenile") ? "✓" : "○"} · 第二次进化成真正的形态 ${pet.rarityUpgrades.includes("adult") ? "✓" : "○"} · 累计活跃 ${pet.activeDays}/${ACTIVE_DAYS_FOR_UPGRADE} 天 ${pet.rarityUpgrades.includes("activeDays") ? "✓" : "○"}</p>
      <p class="muted">靠努力最多比孵化时高 2 档；传说只能孵化时抽到。（${RARITIES.map((r) => RARITY_NAME[r]).join(" → ")}）</p>
    </div>
  </div>`;
}

const typesHtml = (pet: PetState) => petTypes(pet).map((t) => typePill(t)).join(" ");

function renderDex(s: GameState): string {
  const captured = Object.values(s.dex).filter((e) => e.captured).length;
  return `<div class="card"><h2>图鉴 ${captured} / ${ROSTER.length}</h2>
    <div class="dex">${ROSTER.map((sp) => {
      const e = s.dex[sp.id];
      if (!e) return `<div class="cell"><div style="height:48px;line-height:48px" class="muted">?</div><div class="muted">？？？</div></div>`;
      return `<div class="cell">${canvas(wildSpec(sp.id, e.shiny), e.captured ? "" : "silhouette")}<div>${e.captured ? speciesName(sp.id) : "剪影"}</div><div class="muted">${RARITY_NAME[sp.rarity]}</div></div>`;
    }).join("")}</div>
    <h3>从野怪学会的技能</h3><p>${s.learned.map((id) => `${skillName(id)}（${TYPE_NAME[getSkill(id).type!]}）`).join("、") || '<span class="muted">还没有</span>'}</p>
  </div>`;
}

function nextBossDate(s: GameState): string {
  for (let i = 0; i < 14; i++) if (isBossDay(addDays(s.today, i), s.pet.hatchedOn)) return addDays(s.today, i);
  return s.today;
}

function renderBattle(s: GameState): string {
  const bossDate = nextBossDate(s);
  const bossType = nextBossType({ ...s, today: bossDate }) as EchoType;
  const known = knownSkills(s.pet, s.learned);
  const loadout = currentLoadout(s);
  const err = validateLoadout(s.pet, loadout, known);
  return `<div class="stack">
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
    <div class="row" style="margin-top:10px"><button class="primary" data-act="live">过完这一天</button><button data-act="ff">按"${PERSONA_NAME[s.persona]}"快进 7 天</button></div>
    <h3>昨天的回响（跟自己平时比，−1 到 +1）</h3>
    <div class="row">${Object.entries(s.lastEchoes).map(([t, v]) => `<span class="pill">${TYPE_NAME[t as ElementType]} ${(v as number) >= 0 ? "+" : ""}${(v as number).toFixed(2)}</span>`).join("") || '<span class="muted">还没有</span>'}</div>
    <h3>原型说明</h3>
    <p class="muted" style="font-size:12px">游戏规则全部来自 packages/engine（和服务器以后用的是同一套）。宠物说的话是模板，以后换成 AI。进度存在浏览器里。</p>
    <button class="small" data-act="reset">重新开始</button>
  </div>`;
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

function renderReplay(): string {
  if (!replay || !state) return "";
  const { report, step } = replay;
  const log = report.result.log.slice(0, step);
  const last = log[log.length - 1];
  const hp = last?.hp ?? report.result.maxHp;
  const done = step >= report.result.log.length;
  const mine = "我";
  const theirs = speciesName(report.opponentName);
  return `<div class="modal-bg"><div class="modal">
    <h2>${replay.boss ? "周 Boss" : "每日试炼"} · ${report.date.slice(5)}</h2>
    <div class="battle-side">${canvas(replay.mine)}<div><div>我的宠物</div><div class="hp"><i style="width:${pct(hp[0] / report.result.maxHp[0])}"></i></div></div></div>
    <div class="battle-side">${canvas(replay.theirs)}<div><div>${theirs}</div><div class="hp"><i style="width:${pct(hp[1] / report.result.maxHp[1])}"></i></div></div></div>
    <div class="battle-log">${log.map((e) => `<div>第 ${e.turn} 回合：${eventText(e, mine, theirs)}</div>`).join("")}${done ? `<div><b>${report.result.winner === "a" ? "胜利！" : report.result.winner === "draw" ? "平局" : "失败……"}</b></div>` : ""}</div>
    <div class="row" style="margin-top:10px;justify-content:flex-end">${done ? "" : '<button class="small" data-act="skip">跳过</button>'}<button class="small primary" data-act="close-replay">关闭</button></div>
  </div></div>`;
}

function render() {
  if (!state) {
    app.innerHTML = renderStart();
  } else {
    const s = state;
    const body = { today: renderToday, pet: renderPet, dex: renderDex, battle: renderBattle }[tab](s);
    app.innerHTML = `<div class="top"><h1>Pulseling 原型</h1><span class="muted">第 ${dayNumber(s)} 天</span><span class="spacer"></span>${s.trial === "active" ? '<span class="pill">试用中</span>' : ""}</div>
      <div class="layout">
        ${renderWatch(s)}
        <div><div class="tabs">${(["today", "pet", "dex", "battle"] as Tab[]).map((t) => `<button class="${tab === t ? "on" : ""}" data-act="tab" data-v="${t}">${{ today: "今天", pet: "宠物", dex: "图鉴", battle: "对战" }[t]}</button>`).join("")}</div>${body}</div>
        ${renderDev(s)}
      </div>
      ${s.trial === "offered" && !replay && !paywallHidden ? renderPaywall(s) : ""}
      ${renderReplay()}`;
  }
  drawAll();
}

function drawAll() {
  app.querySelectorAll<HTMLCanvasElement>("canvas[data-sprite]").forEach((c) => {
    drawSprite(c, { ...(JSON.parse(decodeURIComponent(c.dataset.sprite!)) as SpriteSpec), frame });
  });
}

function update(next: GameState | null) {
  state = next;
  if (state) save(state);
  if (state?.morning && state.morning.date !== seenMorning) {
    seenMorning = state.morning.date;
    showBubble(shortLine(state));
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
    case "hatch": return update(newGame(setup.starter, setup.persona));
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
    case "skip": if (replay) replay.step = replay.report.result.log.length; return render();
    case "close-replay": replay = null; return render();
    case "skill": {
      const cur = currentLoadout(state!);
      const id = v as SkillId;
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < 4 ? [...cur, id] : [...cur.slice(1), id];
      return update(setLoadout(state!, next, state!.tactic));
    }
    case "tactic": return update(setLoadout(state!, currentLoadout(state!), v as Tactic));
    case "pet-tap": break;
  }
});

app.addEventListener("click", (ev) => {
  if ((ev.target as HTMLElement).classList.contains("pet-tap") && state) {
    heart = true;
    showBubble(shortLine(state));
    render();
    setTimeout(() => { heart = false; render(); }, 900);
  }
});

app.addEventListener("input", (ev) => {
  const el = ev.target as HTMLInputElement;
  const key = el.dataset.slider;
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
    const c = app.querySelector(".clock");
    if (c) c.textContent = lastClock;
  }
  if (replay && replay.step < replay.report.result.log.length && frame % 1 === 0) {
    replay.step++;
    render();
    const log = app.querySelector(".battle-log");
    if (log) log.scrollTop = log.scrollHeight;
  } else drawAll();
}, 500);

render();
