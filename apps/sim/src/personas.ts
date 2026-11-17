import { addDays, createRng, type AdultVariant, type DailyHealth, type Rng, type Starter } from "@pulseling/engine";

export type PersonaId = "sedentary" | "walker" | "runner" | "lifter" | "athlete" | "improver";

export interface Persona {
  id: PersonaId;
  share: number;
  /** Form this kind of player would aim for. */
  target?: AdultVariant;
  wornChance: number;
}

export const PERSONAS: Persona[] = [
  { id: "sedentary", share: 0.25, wornChance: 0.8 },
  { id: "walker", share: 0.25, wornChance: 0.9 },
  { id: "runner", share: 0.15, target: "flying", wornChance: 0.92 },
  { id: "lifter", share: 0.15, target: "fighting", wornChance: 0.92 },
  { id: "athlete", share: 0.1, target: "dragon", wornChance: 0.95 },
  { id: "improver", share: 0.1, target: "flying", wornChance: 0.88 },
];

export interface SimUser {
  id: string;
  persona: Persona;
  starter: Starter;
  /** Stable per-person traits. */
  traits: { hrv: number; restingHr: number; bedtime: number; deepRatio: number; stepScale: number };
}

const gauss = (rng: Rng) => {
  const u = Math.max(1e-9, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
};
const around = (rng: Rng, mean: number, sd: number, min = 0) => Math.max(min, mean + gauss(rng) * sd);

export function makeUser(index: number, seed: string): SimUser {
  const rng = createRng(`${seed}:user:${index}`);
  let r = rng();
  const persona = PERSONAS.find((p) => (r -= p.share) < 0) ?? PERSONAS[0]!;
  const starters: Starter[] = ["grass", "water", "fire"];
  return {
    id: `${seed}-u${index}`,
    persona,
    starter: starters[Math.floor(rng() * 3)]!,
    traits: {
      hrv: around(rng, 45, 12, 18),
      restingHr: around(rng, 64, 6, 48),
      bedtime: around(rng, -20, 45),
      deepRatio: around(rng, 0.16, 0.03, 0.08),
      stepScale: around(rng, 1, 0.15, 0.6),
    },
  };
}

/**
 * One day of summarised health data. `dayIndex` counts from the start of generated history (install day = 28),
 * so the improver can get gradually better after installing.
 */
export function makeDay(user: SimUser, date: string, dayIndex: number, seed: string): DailyHealth {
  const rng = createRng(`${seed}:${user.id}:${date}`);
  const p = user.persona.id;
  const t = user.traits;
  const worn = rng() < user.persona.wornChance;
  if (!worn) return { date, worn: false };

  const improve = p === "improver" ? Math.min(1, Math.max(0, (dayIndex - 28) / 60)) : 0;
  const weekday = dayIndex % 7;
  const baseSteps = { sedentary: 4000, walker: 8500, runner: 7500, lifter: 7000, athlete: 9500, improver: 4000 + 4000 * improve }[p];
  const sleepMean = { sedentary: 375, walker: 425, runner: 435, lifter: 430, athlete: 455, improver: 380 + 50 * improve }[p];
  const sleepSd = p === "sedentary" ? 60 : 35;
  const bedtimeSd = p === "sedentary" ? 75 : 35;

  let cardio = 0;
  let distance = 0;
  let strength = 0;
  let hiit = 0;
  const runDay = (p === "runner" || p === "athlete") && [0, 2, 4].includes(weekday);
  const improverRun = p === "improver" && rng() < 0.4 * improve;
  if ((runDay && rng() < 0.85) || improverRun) {
    cardio = around(rng, p === "athlete" ? 50 : 40, 10, 15);
    distance = cardio / around(rng, 6.5, 0.8, 4.5);
  }
  const liftDay = (p === "lifter" && [1, 3, 5].includes(weekday)) || (p === "athlete" && [1, 5].includes(weekday));
  if (liftDay && rng() < 0.85) strength = around(rng, 50, 12, 20);
  if (p === "athlete" && weekday === 3 && rng() < 0.85) hiit = around(rng, 25, 6, 10);
  if (p === "walker" && rng() < 0.15) cardio = around(rng, 30, 8, 10);

  const steps = Math.round(around(rng, baseSteps * t.stepScale, baseSteps * 0.25, 500) + distance * 1300);
  const highHr = Math.round(cardio * 0.4 + hiit * 0.8 + strength * 0.15);
  const sleepMinutes = Math.round(around(rng, sleepMean, sleepSd, 180));

  return {
    date,
    worn: true,
    steps,
    standHours: Math.round(around(rng, 9 + steps / 4000, 1.5, 2)),
    activeEnergyKcal: Math.round(150 + steps * 0.04 + cardio * 9 + strength * 6 + hiit * 11 + gauss(rng) * 40),
    flightsClimbed: Math.round(around(rng, p === "sedentary" ? 3 : 8, 3, 0)),
    sleepMinutes,
    bedtimeMinutes: Math.round(around(rng, t.bedtime, bedtimeSd, -240)),
    deepSleepRatio: Math.max(0.05, t.deepRatio + gauss(rng) * 0.02),
    nightHrvMs: Math.round(around(rng, t.hrv * (1 + 0.1 * improve), t.hrv * 0.15, 10)),
    restingHr: Math.round(around(rng, t.restingHr - 3 * improve, 2, 40)),
    cardioMinutes: Math.round(cardio),
    distanceKm: Math.round(distance * 10) / 10,
    strengthMinutes: Math.round(strength),
    highIntensityMinutes: Math.round(hiit),
    intervalMinutes: Math.round(hiit * 0.6),
    highHrZoneMinutes: highHr,
  };
}

export function makeDays(user: SimUser, start: string, count: number, seed: string): DailyHealth[] {
  return Array.from({ length: count }, (_, i) => makeDay(user, addDays(start, i), i, seed));
}
