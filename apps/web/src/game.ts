import {
  addDays,
  adultOptions,
  bossMatchup,
  bossTypeForWeek,
  conditionMultiplier,
  daysBetween,
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
import { RARITY_NAME, speciesName, TYPE_NAME, VARIANT_NAME } from "./text";

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
  }

  if (dayNumber(s) === 3 && s.trial === "none") s.trial = "offered";
  return s;
}

export function startTrial(prev: GameState): GameState {
  return { ...prev, trial: "active" };
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
    return raw ? (JSON.parse(raw) as GameState) : null;
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
