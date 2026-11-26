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
import { activeConfig, eventsOn, flag } from "./config";
import { speciesMsg, typeMsg } from "./text";
import { itemIdFromName, itemMsg, pickSurprise, TREASURE_ITEMS, type IdleMove, type Surprise } from "./surprise";
import { firstWish, pickWish, wishKept, wishResultLine, wishReward, WISH_GROWTH, type Wish } from "./wish";
import { CHATS_PER_DAY, promiseKept, promiseLine, replyLabel, replyLine, weeklyLetter, type PromiseKind, type ReplyId } from "./talk";
import { asMsg, asMsgOrNull, msg, raw, type Msg } from "./i18n";


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
  /** Today's optional wish, if the pet has one. */
  wish?: Wish;
  /** Yesterday's wish, checked against yesterday's data. */
  wishResult?: Wish;
  /** A treasure chest that opened this morning (item id). */
  treasure?: { item: string; growth: number };
  /** Why this morning's encounter was different (meteor, kept wish, guest, weather, an event). */
  boosts: Msg[];
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
  /** All game text is stored as copy keys + params (i18n.ts), never as finished sentences. */
  feed: { date: string; text: Msg; kind: "evolve" | "rarity" | "capture" | "boss" | "info" }[];
  /** Pulseling Plus trial. Free players get everything that matters for growth; Plus adds AI talk and letters (06). */
  trial: "none" | "active";
  letters: { date: string; text: Msg; read: boolean }[];
  chat: { date: string; used: number; log: { from: "me" | "pet"; text: Msg; date: string }[] };
  promises: { kind: PromiseKind; due: string; kept?: boolean }[];
  /** Things the pet remembers, newest first. */
  memories: { date: string; text: Msg }[];
  /** Only in saves from before freemium (decision 68), when the pet hibernated without a trial. Paid back as a gift. */
  hibernatedDays: number;
  /** A line the pet wants to say first thing (e.g. about a kept promise). */
  pendingLine: Msg | null;
  /** Watch-sized version of pendingLine. */
  pendingShort: Msg | null;
  surprises: Surprise[];
  /** Collection book: item id → count. */
  collection: Record<string, number>;
  moves: IdleMove[];
  friendBattles: { date: string; friendId: string; won: boolean; charge: number }[];
  /** The weekly boss waits all day for a tap on the watch; unfought by night, it resolves on its own (no charge). */
  bossPending: { date: string; type: EchoType } | null;
  /** Daily wishes, newest first. */
  wishes: Wish[];
  /** Effects queued for one specific morning's encounter roll. */
  tomorrow: { date: string; luck?: "wish" | "meteor"; guest?: string; weather?: EchoType } | null;
  /** Treasure maps waiting to open. */
  treasures: { opensOn: string }[];
  /** Which config version settled which days: one entry each time the version changes, so a replay can use the same one. */
  configLog: { from: string; version: string }[];
}

export type DayInput = Omit<DailyHealth, "date">;

/** The engine numbers of the config this call runs under (see withConfig). */
const E = () => activeConfig().engine;

/** A new game from the Health history read at install (28 days, possibly all unworn if access was denied). */
export function createGame(input: { userId: string; starter: Starter; installDate: string; history: DailyHealth[]; persona?: string }): GameState {
  const { userId, starter, installDate, history, persona } = input;
  const { pet, facts } = hatch({ id: userId, starter, date: installDate, history }, E());
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
    feed: [{ date: installDate, text: msg("feed.hatched"), kind: "info" }],
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
    wishes: [firstWish(installDate)],
    tomorrow: null,
    treasures: [],
    configLog: [{ from: installDate, version: activeConfig().version }],
  };
}

export const dayNumber = (s: GameState) => daysBetween(s.installDate, s.today);

export function status(s: GameState) {
  return evolutionStatus(s.pet, s.history, addDays(s.today, -1), E());
}

export function currentLoadout(s: GameState): SkillId[] {
  if (s.loadout && validateLoadout(s.pet, s.loadout, knownSkills(s.pet, s.learned)) === null) return s.loadout;
  return defaultLoadout(s.pet);
}

export const condition = (s: GameState) => conditionMultiplier(s.qualities.slice(-3), E());

function bump(s: GameState, before: PetState) {
  if (s.pet.stage !== before.stage)
    s.feed.unshift({ date: s.today, text: s.pet.stage === "juvenile" ? msg("feed.evolve.juvenile") : msg("feed.evolve.adult", { variant: msg(`variant.${s.pet.adultVariant ?? "pure"}`) }), kind: "evolve" });
  if (s.pet.rarity !== before.rarity) s.feed.unshift({ date: s.today, text: msg("feed.rarity", { rarity: msg(`rarity.${s.pet.rarity}`) }), kind: "rarity" });
}

/** Live one day with the given data, then run the next morning: encounter, daily trial and (on boss days) the weekly boss. */
export function liveDay(prev: GameState, input: DayInput): GameState {
  const s: GameState = structuredClone(prev);
  const date = s.today;
  const day: DailyHealth = { ...input, date };
  const version = activeConfig().version;
  if (s.configLog.at(-1)?.version !== version) s.configLog.push({ from: date, version });
  const before = s.pet;

  if (s.bossPending) resolveBoss(s, 0);
  const settled = processDay(s.pet, day, s.history, { active: true }, E());
  s.history.push(day);
  s.pendingLine = null;
  s.pendingShort = null;
  for (const p of s.promises) {
    if (p.due !== date || p.kept !== undefined) continue;
    p.kept = promiseKept(p.kind, day);
    s.pendingLine = promiseLine(s.pet.personality, p.kind, p.kept);
    s.pendingShort = msg(p.kept ? "promise.kept.short" : "promise.missed.short");
    if (p.kept) remember(s, msg(`memory.${p.kind}`));
  }
  s.pet = settled.pet;
  s.results.push(settled.result);
  if (settled.result.worn) s.qualities.push(settled.result.quality);

  // Yesterday's wish: optional, so only keeping it changes anything.
  const wish = s.wishes.find((w) => w.date === date && w.kept === undefined);
  if (wish) {
    wish.kept = wishKept(wish, day);
    if (wish.kept) {
      wish.reward = wishReward(s.userId, wish);
      addGrowth(s, WISH_GROWTH);
      if (wish.reward === "luck") queueFor(s, addDays(date, 1), { luck: "wish" });
      const line = wishResultLine(wish);
      s.pendingShort ??= line.short;
      s.feed.unshift({ date: addDays(date, 1), text: line.text, kind: "info" });
    }
  }

  const st = evolutionStatus(s.pet, s.history, date, E());
  if (st.auto) s.pet = evolve(s.pet, st, st.auto, date);
  bump(s, before);

  const morning = addDays(date, 1);
  s.today = morning;

  const recent7 = s.history.slice(-7);
  const aff7 = lifestyleAffinity(recent7, E());
  const aff14 = lifestyleAffinity(s.history.slice(-14), E());
  // Effects queued by yesterday's events: a lucky morning (meteor / kept wish), a guest, or weather.
  const fx = s.tomorrow?.date === morning ? s.tomorrow : null;
  if (s.tomorrow && s.tomorrow.date <= morning) s.tomorrow = null;
  const boosts: Msg[] = [];
  const guest = fx?.guest ? WILD_ROSTER.find((sp) => sp.id === fx.guest) : undefined;
  const events = eventsOn(morning);
  const chanceBoost = (fx?.luck ? 2 : 1) * events.reduce((m, e) => m * (e.effect.encounterChance ?? 1), 1);
  const rollCfg = chanceBoost !== 1 ? { ...E(), encounter: { ...E().encounter, chance: Math.min(0.9, E().encounter.chance * chanceBoost) } } : E();
  const affinity = { ...aff7 };
  for (const t of [fx?.weather, ...events.map((e) => e.effect.weather)]) if (t) affinity[t] = (affinity[t] ?? 0) + 1.5;
  const encounter = guest
    ? { species: guest, shiny: false }
    : rollEncounter(
        {
          userId: s.userId,
          date: morning,
          daysSinceLastEncounter: s.daysSinceEncounter,
          affinity,
          echoes: settled.result.echoes,
          weeklyEnergyFraction: weeklyEnergyFraction(weeklyEnergy(s.results, date), E()),
          dragonEligible: adultOptions(aff7, aff14, E()).find((o) => o.variant === "dragon")!.met,
        },
        rollCfg,
      );
  if (guest) boosts.push(msg("boost.guest"));
  else if (fx?.luck) boosts.push(msg("boost.luck", { why: msg(`luck.${fx.luck}`) }));
  if (!guest && fx?.weather) boosts.push(msg("boost.weather", { type: typeMsg(fx.weather) }));
  if (!guest) for (const e of events) boosts.push(raw(e.text));
  s.daysSinceEncounter = encounter ? 0 : s.daysSinceEncounter + 1;
  s.lastEchoes = settled.result.echoes;

  const trial = runDailyTrial(s.pet, { userId: s.userId, date: morning, wild: encounter?.species ?? null, recentQualities: s.qualities.slice(-3), loadout: currentLoadout(s), tactic: s.tactic }, E());
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
        s.feed.unshift({ date: morning, text: msg("feed.capture", { name: speciesMsg(id) }), kind: "capture" });
      }
      if (encounter.shiny) entry.shiny = true;
    }
  }
  let surprise: Surprise | undefined;
  if (!encounter) {
    const uncapturedTypes = [...new Set(WILD_ROSTER.filter((sp) => !s.dex[sp.id]?.captured).map((sp) => sp.type as EchoType))].filter((t) => t !== ("dragon" as string));
    const guestCandidates = WILD_ROSTER.filter((sp) => sp.type !== "dragon" && !s.dex[sp.id]?.captured).map((sp) => sp.id);
    surprise = pickSurprise({ userId: s.userId, date: morning, pet: s.pet, echoes: settled.result.echoes, history: s.history, uncapturedTypes, recent: s.surprises.slice(0, 3), moves: s.moves, lastMoveDate: s.surprises.find((x) => x.kind === "move")?.date, guestCandidates, treasurePending: s.treasures.length > 0 });
    s.surprises.unshift(surprise);
    s.surprises = s.surprises.slice(0, 30);
    if (surprise.item) s.collection[surprise.item] = (s.collection[surprise.item] ?? 0) + 1;
    if (surprise.move) {
      s.moves.push(surprise.move);
      s.feed.unshift({ date: morning, text: msg("surprise.move.feed", { move: msg(`move.${surprise.move}`) }), kind: "info" });
    }
    const next = addDays(morning, 1);
    if (surprise.kind === "meteor") queueFor(s, next, { luck: "meteor" });
    if (surprise.guest) queueFor(s, next, { guest: surprise.guest });
    if (surprise.weather) queueFor(s, next, { weather: surprise.weather });
    if (surprise.opensOn) s.treasures.push({ opensOn: surprise.opensOn });
  }

  let treasure: MorningReport["treasure"];
  const chest = s.treasures.find((t) => t.opensOn <= morning);
  if (chest) {
    s.treasures = s.treasures.filter((t) => t !== chest);
    const item = TREASURE_ITEMS[hashStr(`${s.userId}:${morning}:treasure`) % TREASURE_ITEMS.length]!;
    s.collection[item] = (s.collection[item] ?? 0) + 1;
    addGrowth(s, TREASURE_GROWTH);
    treasure = { item, growth: TREASURE_GROWTH };
    s.feed.unshift({ date: morning, text: msg("feed.treasure", { item: itemMsg(item), n: TREASURE_GROWTH }), kind: "info" });
  }

  const todayWish = pickWish(s.userId, morning, s.history, s.wishes);
  if (todayWish) {
    s.wishes.unshift(todayWish);
    s.wishes = s.wishes.slice(0, 30);
  }
  s.morning = {
    surprise,
    wish: todayWish ?? undefined,
    wishResult: wish,
    treasure,
    boosts,
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
    s.feed.unshift({ date: morning, text: msg("feed.boss.arrived", { type: typeMsg(type) }), kind: "boss" });
  }

  return s;
}

const WAKE_GIFT = 15;
const TREASURE_GROWTH = 10;

/** Extra growth from gifts (wake-up, wishes, treasure); never pushes past the current evolution threshold. */
function addGrowth(s: GameState, n: number) {
  const t = stageThreshold(s.pet.stage, E());
  s.pet.progress = t ? Math.min(t.threshold, s.pet.progress + n) : s.pet.progress;
  s.pet.totalGrowth += n;
}

/** Queue an effect for one morning's encounter roll, merging with anything already queued for that morning. */
function queueFor(s: GameState, date: string, fx: Omit<NonNullable<GameState["tomorrow"]>, "date">) {
  s.tomorrow = { ...(s.tomorrow?.date === date ? s.tomorrow : {}), ...fx, date };
}

function hashStr(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export type TrialInvite = "talk" | "letter" | "evolve";

/**
 * When to gently invite a free player to try Plus (06): the first time it "wants to talk" (day 3), the first weekly
 * letter, and the day of the first evolution. Never a wall: free play goes on either way. Clients show it as a card
 * the player can put away, at most once every 3 days.
 */
export function trialInvite(s: GameState): TrialInvite | null {
  if (s.trial === "active") return null;
  const yesterday = addDays(s.today, -1);
  if (s.pet.stage === "juvenile" && s.feed.some((f) => f.kind === "evolve" && f.date >= yesterday)) return "evolve";
  if (s.letters.length === 1 && s.letters[0]!.date >= yesterday) return "letter";
  // A/B (06): first invitation on day 3 or day 6. Flag "firstInviteDay", built-in day 3.
  if (dayNumber(s) === flag("firstInviteDay", s.userId, 3)) return "talk";
  return null;
}

/** Start the Plus trial. A save from the hibernation era gets the days it slept back as a small gift. */
export function startTrial(prev: GameState): GameState {
  const s: GameState = structuredClone(prev);
  s.trial = "active";
  if (s.hibernatedDays > 0) {
    addGrowth(s, WAKE_GIFT);
    s.pendingLine = msg("line.wake", { n: s.hibernatedDays });
    s.pendingShort = msg("short.wake");
    s.feed.unshift({ date: s.today, text: msg("feed.wake", { n: WAKE_GIFT }), kind: "info" });
    s.hibernatedDays = 0;
  }
  return s;
}

function remember(s: GameState, text: Msg) {
  s.memories.unshift({ date: s.today, text });
  s.memories = s.memories.slice(0, 12);
}

export const chatsLeft = (s: GameState) => (s.chat.date === s.today ? CHATS_PER_DAY - s.chat.used : CHATS_PER_DAY);

/** One of the day's three short exchanges. Promises are checked against the data of the day they were made for. */
export function chat(prev: GameState, reply: ReplyId): GameState {
  if (chatsLeft(prev) <= 0) return prev;
  const s: GameState = structuredClone(prev);
  if (s.chat.date !== s.today) s.chat = { date: s.today, used: 0, log: s.chat.log };
  s.chat.used++;
  s.chat.log.push({ from: "me", text: replyLabel(reply), date: s.today }, { from: "pet", text: replyLine(s.pet.personality, reply), date: s.today });
  s.chat.log = s.chat.log.slice(-30);
  if (reply === "sleep-early") s.promises.push({ kind: "sleep", due: s.today });
  if (reply === "move") s.promises.push({ kind: "move", due: addDays(s.today, 1) });
  if (reply === "tired") remember(s, msg("memory.tired"));
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
  s.pet = evolve(s.pet, evolutionStatus(s.pet, s.history, date, E()), variant, date);
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
  const { opponent, result } = runWeeklyBoss(s.pet, { userId: s.userId, date, type, recentQualities: s.qualities.slice(-3), loadout: currentLoadout(s), tactic: s.tactic, charge }, E());
  s.boss = { date, opponentName: opponent.name, opponentType: type, result, matchup: bossMatchup(type, petTypes(s.pet)) };
  s.bosses.unshift(s.boss);
  const won = result.winner === "a";
  s.feed.unshift({ date, text: msg(won ? "feed.boss.won" : "feed.boss.lost", { type: typeMsg(type) }), kind: "boss" });
  if (s.today === date) s.pendingShort = msg(won ? "short.boss.won" : "short.boss.lost");
  const weekStart = addDays(date, -7);
  const counter = s.learned.find((id) => effectiveness(getSkill(id).type, [type]) >= SUPER);
  s.letters.unshift({
    date,
    read: false,
    text: weeklyLetter({
      personality: s.pet.personality,
      days: s.history.filter((d) => d.date >= weekStart && d.date < date),
      growth: s.results.filter((r) => r.date >= weekStart && r.date < date).reduce((a, r) => a + r.gain, 0),
      captures: Object.entries(s.dex).filter(([, e]) => e.captured && e.captured > weekStart).map(([id]) => id),
      bossType: type,
      bossWon: won,
      bossAdvantage: s.boss.matchup,
      nextBossType: bossTypeForWeek(s.userId, addDays(date, 1)),
      counterHint: counter ?? null,
    }),
  });
  s.feed.unshift({ date, text: msg("feed.letter"), kind: "info" });
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
  const snap = friendSnapshot(friend.id, s.today, other.pet, { loadout: counterLoadout(theirs, petTypes(s.pet)), tactic: other.tactic, recentQualities: other.qualities }, E());
  const result = runFriendBattle(s.pet, { userId: s.userId, date: s.today, loadout: counterLoadout(s, petTypes(other.pet)), tactic: s.tactic, recentQualities: s.qualities.slice(-3), charge }, snap, E());
  const won = result.winner === "a";
  s.friendBattles.unshift({ date: s.today, friendId: friend.id, won, charge });
  s.friendBattles = s.friendBattles.slice(0, 60);
  // A friend's name is their own text: passed through as is, never translated.
  s.feed.unshift({ date: s.today, text: msg(won ? "feed.friend.won" : "feed.friend.lost", { name: friend.name }), kind: "info" });
  s.pendingShort = msg(won ? "short.friend.won" : "short.friend.lost", { name: friend.name });
  return { state: s, report: { date: s.today, opponentName: friend.name, opponentType: petTypes(other.pet)[0] ?? null, result } };
}

/** Fill fields added after a save was written, so old saves keep loading. */
export function migrate(s: GameState): GameState {
  s.letters ??= [];
  s.chat ??= { date: s.today, used: 0, log: [] };
  s.promises ??= [];
  s.memories ??= [];
  s.hibernatedDays ??= 0;
  if ((s.trial as string) === "offered") s.trial = "none"; // the old paywall state
  s.pendingLine ??= null;
  s.pendingShort ??= null;
  s.surprises ??= [];
  s.collection ??= {};
  s.moves ??= [];
  s.friendBattles ??= [];
  s.bossPending ??= null;
  s.wishes ??= [];
  s.tomorrow ??= null;
  s.treasures ??= [];
  s.configLog ??= [{ from: s.installDate, version: "builtin" }];
  if (s.morning) s.morning.boosts ??= [];
  // Saves from before copy keys hold finished Chinese sentences: keep them as raw text, and map item names to ids.
  for (const f of s.feed) f.text = asMsg(f.text);
  for (const l of s.letters) l.text = asMsg(l.text);
  for (const l of s.chat.log) l.text = asMsg(l.text);
  for (const m of s.memories) m.text = asMsg(m.text);
  s.pendingLine = asMsgOrNull(s.pendingLine);
  s.pendingShort = asMsgOrNull(s.pendingShort);
  const oldSurprise = (x: Surprise) => {
    x.text = asMsg(x.text);
    x.short = asMsg(x.short);
    if (x.item) x.item = itemIdFromName(x.item);
  };
  s.surprises.forEach(oldSurprise);
  for (const w of s.wishes) { w.text = asMsg(w.text); w.short = asMsg(w.short); }
  s.collection = Object.fromEntries(Object.entries(s.collection).map(([k, n]) => [itemIdFromName(k), n]));
  if (s.tomorrow?.luck && s.tomorrow.luck !== "wish" && s.tomorrow.luck !== "meteor") s.tomorrow.luck = (s.tomorrow.luck as string) === "流星雨" ? "meteor" : "wish";
  if (s.morning) {
    s.morning.boosts = s.morning.boosts.map(asMsg);
    if (s.morning.surprise) oldSurprise(s.morning.surprise);
    for (const w of [s.morning.wish, s.morning.wishResult]) if (w) { w.text = asMsg(w.text); w.short = asMsg(w.short); }
    if (s.morning.treasure) s.morning.treasure.item = itemIdFromName(s.morning.treasure.item);
  }
  return s;
}
