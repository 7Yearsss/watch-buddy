import {
  adultOptions,
  bossMatchup,
  bossTypeForWeek,
  createRng,
  defaultLoadout,
  effectiveness,
  evolutionStatus,
  evolve,
  getSkill,
  hatch,
  isBossDay,
  knownSkills,
  lifestyleAffinity,
  petStats,
  petTypes,
  processDay,
  rollEncounter,
  runDailyTrial,
  runWeeklyBoss,
  SUPER,
  validateLoadout,
  weeklyEnergy,
  weeklyEnergyFraction,
  addDays,
  type AdultVariant,
  type DayResult,
  type EchoScores,
  type ElementType,
  type EngineConfig,
  type Matchup,
  type PetState,
  type Rarity,
  type SkillId,

} from "@pulseling/engine";
import { makeDays, type SimUser } from "./personas";

export const INSTALL = "2026-01-05";
const HISTORY_DAYS = 28;
/** How long a player keeps "charging" towards a target before settling for what is available. */
const TARGET_PATIENCE_DAYS = 28;

export interface Outcome {
  user: SimUser;
  engaged: boolean;
  hatchRarity: Rarity;
  finalRarity: Rarity;
  juvenileDay: number | null;
  adultDay: number | null;
  adultVariant: AdultVariant | null;
  hitTarget: boolean | null;
  chargingDays: number;
  avgDailyGain: number;
  /** Day index (from install) on which each species was first captured. */
  captures: Map<string, number>;
  encounters: number;
  wild: { rarity: Rarity; won: boolean }[];
  bosses: { matchup: Matchup; won: boolean; countered: boolean }[];
  /** Pet as of selected days (for friend-battle checks). */
  snapshots: Map<number, { pet: PetState; qualities: number[]; learned: SkillId[] }>;
}

export function pickLoadout(pet: PetState, learned: SkillId[], opponent: ElementType[], engaged: boolean): { loadout: SkillId[]; countered: boolean } {
  const base = defaultLoadout(pet);
  if (!engaged) return { loadout: base, countered: false };
  const known = knownSkills(pet, learned);
  const own = petTypes(pet);
  if (own.some((t) => effectiveness(t, opponent) > 1)) return { loadout: base, countered: false };
  const counter = learned.find((id) => effectiveness(getSkill(id).type, opponent) >= SUPER);
  if (!counter) return { loadout: base, countered: false };
  const loadout = base.map((id, i) => (i === 2 ? counter : id));
  return validateLoadout(pet, loadout, known) === null ? { loadout, countered: true } : { loadout: base, countered: false };
}

const PREFERENCE: AdultVariant[] = ["dragon", "flying", "fighting", "ground"];

export function simulateUser(user: SimUser, days: number, seed: string, cfg: EngineConfig, snapshotDays: number[] = []): Outcome {
  const history = makeDays(user, addDays(INSTALL, -HISTORY_DAYS), HISTORY_DAYS + days, seed);
  let pet = hatch({ id: user.id, starter: user.starter, date: INSTALL, history: history.slice(0, HISTORY_DAYS) }, cfg).pet;
  const engaged = createRng(`${user.id}:engaged`)() < 0.6;

  const out: Outcome = {
    user,
    engaged,
    hatchRarity: pet.hatchRarity,
    finalRarity: pet.rarity,
    juvenileDay: null,
    adultDay: null,
    adultVariant: null,
    hitTarget: null,
    chargingDays: 0,
    avgDailyGain: 0,
    captures: new Map(),
    encounters: 0,
    wild: [],
    bosses: [],
    snapshots: new Map(),
  };

  const results: DayResult[] = [];
  const qualities: number[] = [];
  const learned: SkillId[] = [];
  let daysSinceEncounter = 0;
  let prevEchoes: EchoScores = {};

  for (let i = HISTORY_DAYS; i < history.length; i++) {
    const day = history[i]!;
    const dayNo = i - HISTORY_DAYS;
    const recent = history.slice(Math.max(0, i - 35), i + 1);

    const settled = processDay(pet, day, recent.slice(0, -1), { active: true }, cfg);
    pet = settled.pet;
    results.push(settled.result);
    if (settled.result.worn) qualities.push(settled.result.quality);

    const status = evolutionStatus(pet, recent, day.date, cfg);
    if (status.auto) {
      pet = evolve(pet, status, status.auto, day.date);
    } else if (status.ready && status.nextStage === "adult") {
      out.chargingDays++;
      if (!pet.target || out.chargingDays > TARGET_PATIENCE_DAYS) {
        const pick = PREFERENCE.map((v) => status.options.find((o) => o.variant === v && o.met)).find(Boolean)?.variant ?? "pure";
        pet = evolve(pet, status, pick, day.date);
      }
    }
    if (pet.stage === "juvenile" && out.juvenileDay === null) {
      out.juvenileDay = dayNo;
      pet = { ...pet, target: user.persona.target };
    }
    if (pet.stage === "adult" && out.adultDay === null) {
      out.adultDay = dayNo;
      out.adultVariant = pet.adultVariant ?? null;
      out.hitTarget = user.persona.target ? pet.adultVariant === user.persona.target : null;
    }

    const aff7 = lifestyleAffinity(history.slice(Math.max(0, i - 6), i + 1), cfg);
    const aff14 = lifestyleAffinity(history.slice(Math.max(0, i - 13), i + 1), cfg);
    const dragonEligible = adultOptions(aff7, aff14, cfg).find((o) => o.variant === "dragon")!.met;
    const encounter = rollEncounter(
      {
        userId: user.id,
        date: day.date,
        daysSinceLastEncounter: daysSinceEncounter,
        affinity: aff7,
        echoes: prevEchoes,
        weeklyEnergyFraction: weeklyEnergyFraction(weeklyEnergy(results, day.date), cfg),
        dragonEligible,
      },
      cfg,
    );
    daysSinceEncounter = encounter ? 0 : daysSinceEncounter + 1;
    prevEchoes = settled.result.echoes;

    const trial = runDailyTrial(pet, { userId: user.id, date: day.date, wild: encounter?.species ?? null, recentQualities: qualities.slice(-3) }, cfg);
    if (encounter) {
      out.encounters++;
      out.wild.push({ rarity: encounter.species.rarity, won: trial.captured });
      if (trial.captured && !out.captures.has(encounter.species.id)) {
        out.captures.set(encounter.species.id, dayNo);
        learned.push(encounter.species.teaches);
      }
    }

    if (isBossDay(day.date, pet.hatchedOn)) {
      const type = bossTypeForWeek(user.id, day.date);
      const { loadout, countered } = pickLoadout(pet, learned, [type], engaged);
      const { result } = runWeeklyBoss(
        pet,
        { userId: user.id, date: day.date, type, recentQualities: qualities.slice(-3), loadout },
        cfg,
      );
      out.bosses.push({ matchup: bossMatchup(type, petTypes(pet)), won: result.winner === "a", countered });
    }
    if (snapshotDays.includes(dayNo)) out.snapshots.set(dayNo, { pet, qualities: qualities.slice(-3), learned: [...learned] });
  }

  out.finalRarity = pet.rarity;
  const worn = results.filter((r) => r.worn);
  out.avgDailyGain = worn.reduce((s, r) => s + r.gain, 0) / Math.max(1, worn.length);
  return out;
}
