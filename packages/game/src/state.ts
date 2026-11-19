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
  friendSnapshot,
  runFriendBattle,
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
  type ElementType,
  type HatchFacts,
  type Matchup,
  type PetState,
  type Rarity,
  type SkillId,
  type Starter,
  type Tactic,
} from "@pulseling/engine";
import { RARITY_NAME, skillName, speciesName, TYPE_NAME, VARIANT_NAME } from "./text";
import { pickSurprise, type IdleMove, type Surprise } from "./surprise";
import { CHATS_PER_DAY, promiseKept, promiseLine, replyLine, weeklyLetter, type PromiseKind, type ReplyId } from "./talk";


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
  /** Mornings without a wild monster get one small surprise. */
  surprise?: Surprise;
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
  /** Prototype only: which simulated persona generates the data. The server ignores it. */
  persona?: string;
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
  surprises: Surprise[];
  /** Collection book: item name → count. */
  collection: Record<string, number>;
  moves: IdleMove[];
  friendBattles: { date: string; friendId: string; won: boolean; charge: number }[];
  /** The weekly boss waits all day for a tap on the watch; unfought by night, it resolves on its own (no charge). */
  bossPending: { date: string; type: EchoType } | null;
}

export type DayInput = Omit<DailyHealth, "date">;

/** A new game from the Health history read at install (28 days, possibly all unworn if access was denied). */
export function createGame(input: { userId: string; starter: Starter; installDate: string; history: DailyHealth[]; persona?: string }): GameState {
  const { userId, starter, installDate, history, persona } = input;
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
    surprises: [],
    collection: {},
    moves: [],
    friendBattles: [],
    bossPending: null,
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

  if (s.bossPending) resolveBoss(s, 0);
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
  let surprise: Surprise | undefined;
  if (!encounter) {
    const uncapturedTypes = [...new Set(WILD_ROSTER.filter((sp) => !s.dex[sp.id]?.captured).map((sp) => sp.type as EchoType))].filter((t) => t !== ("dragon" as string));
    surprise = pickSurprise({ userId: s.userId, date: morning, pet: s.pet, echoes: settled.result.echoes, history: s.history, uncapturedTypes, recent: s.surprises.slice(0, 3), moves: s.moves, lastMoveDate: s.surprises.find((x) => x.kind === "move")?.date });
    s.surprises.unshift(surprise);
    s.surprises = s.surprises.slice(0, 30);
    if (surprise.item) s.collection[surprise.item] = (s.collection[surprise.item] ?? 0) + 1;
    if (surprise.move) {
      s.moves.push(surprise.move);
      s.feed.unshift({ date: morning, text: surprise.text.replace("！点点我看看", "！"), kind: "info" });
    }
  }
  s.morning = {
    surprise,
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
    s.bossPending = { date: morning, type };
    s.feed.unshift({ date: morning, text: `这周的 Boss 来了：${TYPE_NAME[type]}系！`, kind: "boss" });
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

export const ROSTER = WILD_ROSTER;

/** Friend battles auto-bring a counter skill when you know one (there's no loadout screen on the watch). */
export function counterLoadout(s: GameState, foe: ElementType[]): SkillId[] {
  const base = currentLoadout(s);
  if (petTypes(s.pet).some((t) => effectiveness(t, foe) > 1)) return base;
  const counter = s.learned.find((id) => effectiveness(getSkill(id).type, foe) >= SUPER);
  if (!counter || base.includes(counter)) return base;
  const loadout = base.map((id, i) => (i === base.length - 1 ? counter : id));
  return validateLoadout(s.pet, loadout, knownSkills(s.pet, s.learned)) === null ? loadout : base;
}

/** Fight the weekly boss now. `charge` is the watch tap (0–1). Also writes the weekly letter, which talks about the result. */
export function fightBoss(prev: GameState, charge: number): GameState {
  const s: GameState = structuredClone(prev);
  resolveBoss(s, charge);
  return s;
}

function resolveBoss(s: GameState, charge: number) {
  const pending = s.bossPending;
  if (!pending) return;
  const { date, type } = pending;
  s.bossPending = null;
  const { opponent, result } = runWeeklyBoss(s.pet, { userId: s.userId, date, type, recentQualities: s.qualities.slice(-3), loadout: currentLoadout(s), tactic: s.tactic, charge }, cfg);
  s.boss = { date, opponentName: opponent.name, opponentType: type, result, matchup: bossMatchup(type, petTypes(s.pet)) };
  s.bosses.unshift(s.boss);
  const won = result.winner === "a";
  s.feed.unshift({ date, text: won ? `打赢了${TYPE_NAME[type]}系周 Boss！` : `${TYPE_NAME[type]}系周 Boss 没打过，下周再来`, kind: "boss" });
  if (s.today === date) s.pendingShort = won ? "打赢 Boss 啦！" : "Boss 好强……";
  const weekStart = addDays(date, -7);
  const counter = s.learned.find((id) => effectiveness(getSkill(id).type, [type]) >= SUPER);
  s.letters.unshift({
    date,
    read: false,
    text: weeklyLetter({
      personality: s.pet.personality,
      days: s.history.filter((d) => d.date >= weekStart && d.date < date),
      growth: s.results.filter((r) => r.date >= weekStart && r.date < date).reduce((a, r) => a + r.gain, 0),
      captures: Object.entries(s.dex).filter(([, e]) => e.captured && e.captured > weekStart).map(([id]) => speciesName(id)),
      bossType: type,
      bossWon: won,
      bossAdvantage: s.boss.matchup,
      nextBossType: bossTypeForWeek(s.userId, addDays(date, 1)),
      counterHint: counter ? skillName(counter) : null,
    }),
  });
  s.feed.unshift({ date, text: "收到了一封来信", kind: "info" });
}

/** What a friend's pet looks like to the server: saved after each settled day, read when someone challenges it. */
export interface FriendPetSnapshot {
  pet: PetState;
  learned: SkillId[];
  loadout: SkillId[] | null;
  tactic: Tactic;
  qualities: number[];
}

export const snapshotOf = (s: GameState): FriendPetSnapshot => ({ pet: s.pet, learned: s.learned, loadout: s.loadout, tactic: s.tactic, qualities: s.qualities.slice(-3) });

export const foughtFriendToday = (s: GameState, id: string) => s.friendBattles.some((b) => b.friendId === id && b.date === s.today);

/** Challenge a friend's snapshot. Both sides auto-bring a counter skill (there's no loadout screen on the watch). */
export function fightFriend(prev: GameState, friend: { id: string; name: string }, other: FriendPetSnapshot, charge: number): { state: GameState; report: BattleReport } {
  const s: GameState = structuredClone(prev);
  const theirs = { ...prev, pet: other.pet, learned: other.learned, loadout: other.loadout, tactic: other.tactic } as GameState;
  const snap = friendSnapshot(friend.id, s.today, other.pet, { loadout: counterLoadout(theirs, petTypes(s.pet)), tactic: other.tactic, recentQualities: other.qualities }, cfg);
  const result = runFriendBattle(s.pet, { userId: s.userId, date: s.today, loadout: counterLoadout(s, petTypes(other.pet)), tactic: s.tactic, recentQualities: s.qualities.slice(-3), charge }, snap, cfg);
  const won = result.winner === "a";
  s.friendBattles.unshift({ date: s.today, friendId: friend.id, won, charge });
  s.friendBattles = s.friendBattles.slice(0, 60);
  s.feed.unshift({ date: s.today, text: won ? `切磋赢了${friend.name}！` : `跟${friend.name}切磋，下次再来`, kind: "info" });
  s.pendingShort = won ? `赢了${friend.name}！` : `${friend.name}好强…`;
  return { state: s, report: { date: s.today, opponentName: friend.name, opponentType: petTypes(other.pet)[0] ?? null, result } };
}

/** Fill fields added after a save was written, so old saves keep loading. */
export function migrate(s: GameState): GameState {
  s.letters ??= [];
  s.chat ??= { date: s.today, used: 0, log: [] };
  s.promises ??= [];
  s.memories ??= [];
  s.hibernatedDays ??= 0;
  s.pendingLine ??= null;
  s.pendingShort ??= null;
  s.surprises ??= [];
  s.collection ??= {};
  s.moves ??= [];
  s.friendBattles ??= [];
  s.bossPending ??= null;
  return s;
}
