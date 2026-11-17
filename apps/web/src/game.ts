import {
  addDays,
  adultOptions,
  bossMatchup,
  bossTypeForWeek,
  conditionMultiplier,
  daysBetween,
  effectiveness,
  getSkill,
  stageThreshold,
  SUPER,
  defaultConfig as cfg,
  defaultLoadout,
  evolutionStatus,
  evolve,
  hatch,
  isBossDay,
  knownSkills,
  lifestyleAffinity,
  petTypes,
  processDay,
  rollEncounter,
  runDailyTrial,
  runWeeklyBoss,
  validateLoadout,
  weeklyEnergy,
  weeklyEnergyFraction,
  WILD_ROSTER,
  type AdultVariant,
  type BattleResult,
  type DailyHealth,
  type DayResult,
  type EchoScores,
  type EchoType,
  type HatchFacts,
  type Matchup,
  type PetState,
  type Rarity,
  type SkillId,
  type Starter,
  type Tactic,
} from "@pulseling/engine";
import { makeDay, PERSONAS, type PersonaId, type SimUser } from "@pulseling/sim/personas";
import { RARITY_NAME, skillName, speciesName, TYPE_NAME, VARIANT_NAME } from "./text";
import { CHATS_PER_DAY, promiseKept, promiseLine, replyLine, weeklyLetter, type PromiseKind, type ReplyId } from "./talk";

const HISTORY_DAYS = 28;
const STORAGE_KEY = "pulseling-prototype-v1";

export interface BattleReport {
  date: string;
  opponentName: string;
  opponentType: string | null;
  opponentRarity?: Rarity;
  shiny?: boolean;
  result: BattleResult;
}

export interface MorningReport {
  date: string;
  sleepMinutes?: number;
  trial: BattleReport;
  encounter: boolean;
  captured: boolean;
  newSpecies: boolean;
  newSkill?: SkillId;
}

export interface BossReport extends BattleReport {
  matchup: Matchup;
}

export interface DexEntry {
  seen: string;
  captured?: string;
  shiny?: boolean;
}

export interface GameState {
  version: 1;
  userId: string;
  persona: PersonaId;
  installDate: string;
  /** The next calendar day to be lived. */
  today: string;
  history: DailyHealth[];
  pet: PetState;
  facts: HatchFacts;
  results: DayResult[];
  qualities: number[];
  dex: Record<string, DexEntry>;
  learned: SkillId[];
  daysSinceEncounter: number;
  lastEchoes: EchoScores;
  morning: MorningReport | null;
  boss: BossReport | null;
  bosses: BossReport[];
  loadout: SkillId[] | null;
  tactic: Tactic;
  feed: { date: string; text: string; kind: "evolve" | "rarity" | "capture" | "boss" | "info" }[];
  trial: "none" | "offered" | "active";
  letters: { date: string; text: string; read: boolean }[];
  chat: { date: string; used: number; log: { from: "me" | "pet"; text: string; date: string }[] };
  promises: { kind: PromiseKind; due: string; kept?: boolean }[];
  /** Things the pet remembers, newest first. */
  memories: { date: string; text: string }[];
  hibernatedDays: number;
  /** A line the pet wants to say first thing (e.g. about a kept promise). */
  pendingLine: string | null;
  /** Watch-sized version of pendingLine. */
  pendingShort: string | null;
}

export type DayInput = Omit<DailyHealth, "date">;

function simUser(state: Pick<GameState, "userId" | "persona">, starter: Starter): SimUser {
  return {
    id: state.userId,
    persona: PERSONAS.find((p) => p.id === state.persona)!,
    starter,
    traits: { hrv: 45, restingHr: 63, bedtime: -20, deepRatio: 0.16, stepScale: 1 },
  };
}

export function personaDay(state: Pick<GameState, "userId" | "persona" | "history" | "installDate">, starter: Starter, date: string): DayInput {
  const index = daysBetween(addDays(state.installDate, -HISTORY_DAYS), date);
  const { date: _date, ...rest } = makeDay(simUser(state, starter), date, index, state.userId);
  return rest;
}

export function newGame(starter: Starter, persona: PersonaId, installDate = new Date().toISOString().slice(0, 10)): GameState {
  const userId = `proto-${Math.random().toString(36).slice(2, 10)}`;
  const base = { userId, persona, installDate, history: [] as DailyHealth[] };
  const history: DailyHealth[] = [];
  for (let i = HISTORY_DAYS; i > 0; i--) {
    const date = addDays(installDate, -i);
    history.push({ date, ...personaDay(base, starter, date) });
  }
  const { pet, facts } = hatch({ id: userId, starter, date: installDate, history }, cfg);
  return {
    version: 1,
    userId,
    persona,
    installDate,
    today: installDate,
    history,
    pet,
    facts,
    results: [],
    qualities: [],
    dex: {},
    learned: [],
    daysSinceEncounter: 0,
    lastEchoes: {},
    morning: null,
    boss: null,
    bosses: [],
    loadout: null,
    tactic: "balanced",
    feed: [{ date: installDate, text: "孵化了！", kind: "info" }],
    trial: "none",
    letters: [],
    chat: { date: installDate, used: 0, log: [] },
    promises: [],
    memories: [],
    hibernatedDays: 0,
    pendingLine: null,
    pendingShort: null,
  };
}

export const dayNumber = (s: GameState) => daysBetween(s.installDate, s.today);

export function status(s: GameState) {
  return evolutionStatus(s.pet, s.history, addDays(s.today, -1), cfg);
}

export function currentLoadout(s: GameState): SkillId[] {
  if (s.loadout && validateLoadout(s.pet, s.loadout, knownSkills(s.pet, s.learned)) === null) return s.loadout;
  return defaultLoadout(s.pet);
}

export const condition = (s: GameState) => conditionMultiplier(s.qualities.slice(-3), cfg);

function bump(s: GameState, before: PetState) {
  if (s.pet.stage !== before.stage)
    s.feed.unshift({ date: s.today, text: s.pet.stage === "juvenile" ? "进化成了成长体！" : `进化成了成熟体（${VARIANT_NAME[s.pet.adultVariant ?? "pure"]}）！`, kind: "evolve" });
  if (s.pet.rarity !== before.rarity) s.feed.unshift({ date: s.today, text: `稀有度提升到 ${RARITY_NAME[s.pet.rarity]}！`, kind: "rarity" });
}

/** Live one day with the given data, then run the next morning: encounter, daily trial and (on boss days) the weekly boss. */
export function liveDay(prev: GameState, input: DayInput): GameState {
  const s: GameState = structuredClone(prev);
  const date = s.today;
  const day: DailyHealth = { ...input, date };
  const before = s.pet;

  const settled = processDay(s.pet, day, s.history, { active: s.trial !== "offered" }, cfg);
  s.history.push(day);
  s.pendingLine = null;
  s.pendingShort = null;
  for (const p of s.promises) {
    if (p.due !== date || p.kept !== undefined) continue;
    p.kept = promiseKept(p.kind, day);
    s.pendingLine = promiseLine(s.pet.personality, p.kind, p.kept);
    s.pendingShort = p.kept ? "说到做到了！" : "没关系，再试试";
    if (p.kept) remember(s, p.kind === "sleep" ? "你答应过早点睡，真的做到了" : "你答应过去运动，真的去了");
  }
  s.pet = settled.pet;
  s.results.push(settled.result);
  if (settled.result.worn) s.qualities.push(settled.result.quality);

  const st = evolutionStatus(s.pet, s.history, date, cfg);
  if (st.auto) s.pet = evolve(s.pet, st, st.auto, date);
  bump(s, before);

  const morning = addDays(date, 1);
  s.today = morning;
  if (s.trial === "offered") {
    s.morning = null;
    s.hibernatedDays++;
    return s;
  }

  const recent7 = s.history.slice(-7);
  const aff7 = lifestyleAffinity(recent7, cfg);
  const aff14 = lifestyleAffinity(s.history.slice(-14), cfg);
  const encounter = rollEncounter(
    {
      userId: s.userId,
      date: morning,
      daysSinceLastEncounter: s.daysSinceEncounter,
      affinity: aff7,
      echoes: settled.result.echoes,
      weeklyEnergyFraction: weeklyEnergyFraction(weeklyEnergy(s.results, date), cfg),
      dragonEligible: adultOptions(aff7, aff14, cfg).find((o) => o.variant === "dragon")!.met,
    },
    cfg,
  );
  s.daysSinceEncounter = encounter ? 0 : s.daysSinceEncounter + 1;
  s.lastEchoes = settled.result.echoes;

  const trial = runDailyTrial(s.pet, { userId: s.userId, date: morning, wild: encounter?.species ?? null, recentQualities: s.qualities.slice(-3), loadout: currentLoadout(s), tactic: s.tactic }, cfg);
  let newSpecies = false;
  let newSkill: SkillId | undefined;
  if (encounter) {
    const id = encounter.species.id;
    const entry = (s.dex[id] ??= { seen: morning });
    if (trial.captured) {
      if (!entry.captured) {
        entry.captured = morning;
        newSpecies = true;
        if (!s.learned.includes(encounter.species.teaches)) {
          s.learned.push(encounter.species.teaches);
          newSkill = encounter.species.teaches;
        }
        s.feed.unshift({ date: morning, text: `收服了 ${speciesName(id)}！`, kind: "capture" });
      }
      if (encounter.shiny) entry.shiny = true;
    }
  }
  s.morning = {
    date: morning,
    sleepMinutes: day.sleepMinutes,
    encounter: !!encounter,
    captured: trial.captured,
    newSpecies,
    newSkill,
    trial: {
      date: morning,
      opponentName: trial.opponent.name,
      opponentType: trial.opponent.types[0] ?? null,
      opponentRarity: encounter?.species.rarity,
      shiny: encounter?.shiny,
      result: trial.result,
    },
  };

  if (isBossDay(morning, s.pet.hatchedOn)) {
    const type = bossTypeForWeek(s.userId, morning);
    const { opponent, result } = runWeeklyBoss(s.pet, { userId: s.userId, date: morning, type, recentQualities: s.qualities.slice(-3), loadout: currentLoadout(s), tactic: s.tactic }, cfg);
    s.boss = { date: morning, opponentName: opponent.name, opponentType: type, result, matchup: bossMatchup(type, petTypes(s.pet)) };
    s.bosses.unshift(s.boss);
    s.feed.unshift({ date: morning, text: result.winner === "a" ? `打赢了${TYPE_NAME[type]}系周 Boss！` : `${TYPE_NAME[type]}系周 Boss 没打过，下周再来`, kind: "boss" });
    const weekStart = addDays(morning, -7);
    const counter = s.learned.find((id) => effectiveness(getSkill(id).type, [type]) >= SUPER);
    s.letters.unshift({
      date: morning,
      read: false,
      text: weeklyLetter({
        personality: s.pet.personality,
        days: s.history.filter((d) => d.date >= weekStart),
        growth: s.results.filter((r) => r.date >= weekStart).reduce((a, r) => a + r.gain, 0),
        captures: Object.entries(s.dex).filter(([, e]) => e.captured && e.captured > weekStart).map(([id]) => speciesName(id)),
        bossType: type,
        bossWon: result.winner === "a",
        bossAdvantage: s.boss.matchup,
        nextBossType: bossTypeForWeek(s.userId, addDays(morning, 1)),
        counterHint: counter ? skillName(counter) : null,
      }),
    });
    s.feed.unshift({ date: morning, text: "收到了一封来信", kind: "info" });
  }

  if (dayNumber(s) === 3 && s.trial === "none") s.trial = "offered";
  return s;
}

const WAKE_GIFT = 15;

/** Waking from hibernation never punishes: the pet keeps everything and brings a small gift. */
export function startTrial(prev: GameState): GameState {
  const s: GameState = structuredClone(prev);
  s.trial = "active";
  if (s.hibernatedDays > 0) {
    const t = stageThreshold(s.pet.stage, cfg);
    s.pet.progress = t ? Math.min(t.threshold, s.pet.progress + WAKE_GIFT) : s.pet.progress;
    s.pet.totalGrowth += WAKE_GIFT;
    s.pendingLine = `我睡了 ${s.hibernatedDays} 天，梦里一直在找你。送你一份礼物！`;
    s.pendingShort = "我醒啦！";
    s.feed.unshift({ date: s.today, text: `醒来了，带回一份礼物：成长值 +${WAKE_GIFT}`, kind: "info" });
    s.hibernatedDays = 0;
  }
  return s;
}

function remember(s: GameState, text: string) {
  s.memories.unshift({ date: s.today, text });
  s.memories = s.memories.slice(0, 12);
}

export const chatsLeft = (s: GameState) => (s.chat.date === s.today ? CHATS_PER_DAY - s.chat.used : CHATS_PER_DAY);

/** One of the day's three short exchanges. Promises are checked against the data of the day they were made for. */
export function chat(prev: GameState, reply: ReplyId, label: string): GameState {
  if (chatsLeft(prev) <= 0 || prev.trial === "offered") return prev;
  const s: GameState = structuredClone(prev);
  if (s.chat.date !== s.today) s.chat = { date: s.today, used: 0, log: s.chat.log };
  s.chat.used++;
  s.chat.log.push({ from: "me", text: label, date: s.today }, { from: "pet", text: replyLine(s.pet.personality, reply), date: s.today });
  s.chat.log = s.chat.log.slice(-30);
  if (reply === "sleep-early") s.promises.push({ kind: "sleep", due: s.today });
  if (reply === "move") s.promises.push({ kind: "move", due: addDays(s.today, 1) });
  if (reply === "tired") remember(s, "你说过那天好累");
  s.promises = s.promises.slice(-10);
  return s;
}

export function readLetter(prev: GameState, date: string): GameState {
  return { ...prev, letters: prev.letters.map((l) => (l.date === date ? { ...l, read: true } : l)) };
}

export function setTarget(prev: GameState, target: AdultVariant | undefined): GameState {
  return { ...prev, pet: { ...prev.pet, target } };
}

export function chooseEvolution(prev: GameState, variant: AdultVariant): GameState {
  const s = structuredClone(prev);
  const before = s.pet;
  const date = addDays(s.today, -1);
  s.pet = evolve(s.pet, evolutionStatus(s.pet, s.history, date, cfg), variant, date);
  bump(s, before);
  return s;
}

export function setLoadout(prev: GameState, loadout: SkillId[], tactic: Tactic): GameState {
  return { ...prev, loadout, tactic };
}

export function nextBossType(s: GameState): EchoType {
  return bossTypeForWeek(s.userId, s.today);
}

export function save(s: GameState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

export function load(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    s.letters ??= [];
    s.chat ??= { date: s.today, used: 0, log: [] };
    s.promises ??= [];
    s.memories ??= [];
    s.hibernatedDays ??= 0;
    s.pendingLine ??= null;
    s.pendingShort ??= null;
    return s;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export const ROSTER = WILD_ROSTER;
