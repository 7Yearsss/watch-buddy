import type { AdultVariant, DailyMetric, EchoType, Rarity, ScoreKey, Stat, WeeklyMetric } from "./types";

export interface EngineConfig {
  baseline: {
    windowDays: number;
    /** Below this many worn days, blend with population defaults. */
    blendDays: number;
    dailyDefaults: Record<DailyMetric, number>;
    dailyFloors: Partial<Record<DailyMetric, number>>;
    weeklyDefaults: Record<WeeklyMetric, number>;
    weeklyFloors: Record<WeeklyMetric, number>;
    bedtimeDefault: number;
    nightHrvDefault: number;
    nightHrvFloor: number;
  };
  score: {
    /** +50% over baseline = full score. */
    ratioScale: number;
    restingHrScale: number;
    nightHrvScale: number;
    deepSleepScale: number;
    nightHrvAvgDays: number;
    sleep: { idealMin: number; idealMax: number; penaltyPerHour: number };
    bedtime: { fullWithin: number; worstAt: number };
    activeDays: { neutral: number; span: number; minSteps: number; minWorkoutMinutes: number };
  };
  /** Per-day anti-cheat caps applied before scoring. */
  caps: Partial<Record<keyof import("./types").DailyHealth, number>>;
  echoWeights: Record<EchoType, Partial<Record<ScoreKey, number>>>;
  /** The daily bonus averages the best few echoes, so one noisy metric can't max it out. */
  /** `ordinaryNightEcho`: the water echo a night counts as when there is no sleep data, and the floor for a poor tracked night. */
  growth: { base: number; bonus: number; statBase: number; statBonus: number; topEchoes: number; ordinaryNightEcho: number };
  condition: { max: number; days: number };
  statSources: Record<Stat, EchoType[]>;
  /** Absolute lifestyle references used for evolution branches and wild encounters. */
  affinity: {
    stepsPerDay: number;
    standHoursPerDay: number;
    sleepMinutesPerNight: number;
    /** Sleep at or below this counts as zero towards the water lifestyle. */
    sleepFloorMinutes: number;
    bedtimeRegularWithin: number;
    deepSleepRatio: number;
    activeEnergyPerDay: number;
    vigorousMinutesPerWeek: number;
    strengthMinutesPerWeek: number;
    cardioMinutesPerWeek: number;
    distanceKmPerWeek: number;
    highHrMinutesPerWeek: number;
    activeDaysPerWeek: number;
    flightsPerDay: number;
  };
  encounter: {
    chance: number;
    /** After this many days without an encounter, the next one is guaranteed. */
    pityDays: number;
    rarityWeights: Record<Rarity, number>;
    /** Rare/epic weights grow by up to this factor as the week's energy fills up. */
    weeklyRareBoost: number;
    typeWeight: { base: number; affinity: number; echo: number };
    /** Dragon weight when the dragon lifestyle is not met: rare, but never impossible, so everyone can finish the dex. */
    dragonBaseWeight: number;
    /** Water and shadow wilds weigh in at least this affinity, so people who take the watch off at night can still find them. */
    sleepTypeAffinityFloor: number;
    shinyOdds: number;
  };
  opponents: {
    wildStrength: Record<Rarity, number>;
    trainingStrength: number;
    /** Boss strength depends on the type matchup, so no week is a guaranteed win or loss. */
    bossStrength: { bossAdvantage: number; neutral: number; petAdvantage: number };
  };
  evolution: {
    juvenile: { threshold: number; minDays: number };
    adult: { threshold: number; minDays: number };
    windowDays: number;
    minAffinity: number;
    /** First evolution raises rarity if one of these habits reached minAffinity over the window. */
    juvenileUpgrade: { types: EchoType[]; windowDays: number };
    /** Rare: many lifestyles strong at once, including some real exercise. */
    dragon: { minTypes: number; minAffinity: number; minExerciseTypes: number; exerciseTypes: EchoType[]; windowDays: number };
    secondTypes: Exclude<AdultVariant, "pure" | "dragon">[];
  };
}

export const defaultConfig: EngineConfig = {
  baseline: {
    windowDays: 28,
    blendDays: 7,
    dailyDefaults: {
      steps: 6000,
      standHours: 9,
      activeEnergyKcal: 400,
      flightsClimbed: 5,
      deepSleepRatio: 0.15,
      restingHr: 65,
    },
    dailyFloors: {
      steps: 2000,
      standHours: 4,
      activeEnergyKcal: 150,
      flightsClimbed: 2,
      deepSleepRatio: 0.08,
    },
    weeklyDefaults: {
      highHrZoneMinutes: 30,
      intervalMinutes: 10,
      strengthMinutes: 30,
      highIntensityMinutes: 30,
      cardioMinutes: 90,
      distanceKm: 10,
    },
    weeklyFloors: {
      highHrZoneMinutes: 20,
      intervalMinutes: 10,
      strengthMinutes: 30,
      highIntensityMinutes: 20,
      cardioMinutes: 60,
      distanceKm: 5,
    },
    bedtimeDefault: -30,
    nightHrvDefault: 40,
    nightHrvFloor: 15,
  },
  score: {
    ratioScale: 0.5,
    restingHrScale: 0.1,
    nightHrvScale: 0.2,
    deepSleepScale: 0.3,
    nightHrvAvgDays: 7,
    sleep: { idealMin: 420, idealMax: 540, penaltyPerHour: 0.5 },
    bedtime: { fullWithin: 30, worstAt: 120 },
    activeDays: { neutral: 4, span: 3, minSteps: 5000, minWorkoutMinutes: 20 },
  },
  caps: {
    steps: 60000,
    standHours: 18,
    activeEnergyKcal: 3000,
    flightsClimbed: 150,
    highHrZoneMinutes: 240,
    intervalMinutes: 180,
    strengthMinutes: 240,
    highIntensityMinutes: 240,
    cardioMinutes: 360,
    distanceKm: 60,
  },
  echoWeights: {
    grass: { steps: 0.7, standHours: 0.3 },
    water: { sleep: 0.6, bedtime: 0.4 },
    shadow: { deepSleepRatio: 0.6, nightHrv: 0.4 },
    fire: { activeEnergyKcal: 0.6, highIntensityMinutes: 0.4 },
    fighting: { strengthMinutes: 1 },
    flying: { cardioMinutes: 0.7, distanceKm: 0.3 },
    electric: { highHrZoneMinutes: 0.7, intervalMinutes: 0.3 },
    ground: { activeDays: 0.6, flightsClimbed: 0.4 },
  },
  growth: { base: 10, bonus: 10, statBase: 2, statBonus: 2, topEchoes: 3, ordinaryNightEcho: 0.5 },
  condition: { max: 0.25, days: 3 },
  statSources: {
    hp: ["grass"],
    recovery: ["water", "shadow"],
    attack: ["fire", "fighting"],
    speed: ["flying", "electric"],
    defense: ["ground"],
  },
  // WHO 2020: 150 min moderate or 75 min vigorous aerobic per week, muscle strengthening on 2+ days.
  // Adults need 7+ hours of sleep; healthy adults spend roughly 13–23% of the night in deep sleep.
  affinity: {
    stepsPerDay: 8000,
    standHoursPerDay: 12,
    sleepMinutesPerNight: 420,
    sleepFloorMinutes: 300,
    bedtimeRegularWithin: 60,
    deepSleepRatio: 0.15,
    activeEnergyPerDay: 500,
    vigorousMinutesPerWeek: 75,
    strengthMinutesPerWeek: 60,
    cardioMinutesPerWeek: 150,
    distanceKmPerWeek: 15,
    highHrMinutesPerWeek: 75,
    activeDaysPerWeek: 5,
    flightsPerDay: 10,
  },
  encounter: {
    chance: 0.3,
    pityDays: 4,
    rarityWeights: { common: 70, uncommon: 0, rare: 25, epic: 5, legendary: 0 },
    weeklyRareBoost: 1,
    typeWeight: { base: 1, affinity: 4, echo: 2 },
    dragonBaseWeight: 1,
    sleepTypeAffinityFloor: 0.6,
    shinyOdds: 64,
  },
  opponents: {
    wildStrength: { common: 0.85, uncommon: 0.9, rare: 0.95, epic: 1.05, legendary: 1.15 },
    trainingStrength: 0.8,
    bossStrength: { bossAdvantage: 0.92, neutral: 1.05, petAdvantage: 1.25 },
  },
  evolution: {
    juvenile: { threshold: 200, minDays: 10 },
    adult: { threshold: 850, minDays: 40 },
    windowDays: 21,
    minAffinity: 0.6,
    juvenileUpgrade: { types: ["fire", "fighting", "flying", "electric"], windowDays: 14 },
    dragon: {
      minTypes: 4,
      minAffinity: 0.9,
      minExerciseTypes: 2,
      exerciseTypes: ["fire", "fighting", "flying", "electric"],
      windowDays: 14,
    },
    secondTypes: ["flying", "fighting", "ground"],
  },
};
