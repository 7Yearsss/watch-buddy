export const ECHO_TYPES = [
  "grass",
  "water",
  "shadow",
  "fire",
  "fighting",
  "flying",
  "electric",
  "ground",
] as const;
export type EchoType = (typeof ECHO_TYPES)[number];
export type ElementType = EchoType | "dragon";

export const STARTERS = ["grass", "water", "fire"] as const;
export type Starter = (typeof STARTERS)[number];

export const STATS = ["hp", "recovery", "attack", "speed", "defense"] as const;
export type Stat = (typeof STATS)[number];

export const PERSONALITIES = ["genki", "tsundere", "gentle", "chuuni", "chill"] as const;
export type Personality = (typeof PERSONALITIES)[number];

export const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const;
export type Rarity = (typeof RARITIES)[number];

/** Purely visual. Rarity never changes battle stats. */
export interface Cosmetics {
  accessory?: string;
  eyes?: string;
  effect?: string;
  aura?: string;
}

export type RarityUpgrade = "juvenile" | "adult" | "activeDays";

export type Stage = "baby" | "juvenile" | "adult";
export type AdultVariant = "pure" | "flying" | "fighting" | "electric" | "ground" | "shadow" | "dragon";

export type EchoScores = Partial<Record<EchoType, number>>;

/** One calendar day of health data, already summarised on the phone. Minutes of bedtime are relative to midnight (23:30 → -30). */
export interface DailyHealth {
  date: string;
  worn: boolean;
  steps?: number;
  standHours?: number;
  activeEnergyKcal?: number;
  flightsClimbed?: number;
  sleepMinutes?: number;
  bedtimeMinutes?: number;
  deepSleepRatio?: number;
  nightHrvMs?: number;
  restingHr?: number;
  highHrZoneMinutes?: number;
  intervalMinutes?: number;
  strengthMinutes?: number;
  highIntensityMinutes?: number;
  cardioMinutes?: number;
  distanceKm?: number;
}

export const DAILY_METRICS = [
  "steps",
  "standHours",
  "activeEnergyKcal",
  "flightsClimbed",
  "deepSleepRatio",
  "restingHr",
] as const;
export type DailyMetric = (typeof DAILY_METRICS)[number];

export const WEEKLY_METRICS = [
  "highHrZoneMinutes",
  "intervalMinutes",
  "strengthMinutes",
  "highIntensityMinutes",
  "cardioMinutes",
  "distanceKm",
] as const;
export type WeeklyMetric = (typeof WEEKLY_METRICS)[number];

export type ScoreKey =
  | DailyMetric
  | WeeklyMetric
  | "sleep"
  | "bedtime"
  | "nightHrv"
  | "activeDays";

export interface Baseline {
  daily: Record<DailyMetric, number>;
  weekly: Record<WeeklyMetric, number>;
  bedtimeMinutes: number;
  nightHrvMs: number;
  /** Worn days found in the window. */
  sampleDays: number;
}

export interface PetState {
  id: string;
  starter: Starter;
  personality: Personality;
  /** Rarity rolled at hatch; `rarity` can rise above it through healthy habits. */
  hatchRarity: Rarity;
  rarity: Rarity;
  rarityUpgrades: RarityUpgrade[];
  cosmetics: Cosmetics;
  /** Worn and active days in total (not consecutive, so a missed day never resets it). */
  activeDays: number;
  shiny: boolean;
  stage: Stage;
  adultVariant?: AdultVariant;
  target?: AdultVariant;
  hatchedOn: string;
  stageStartedOn: string;
  /** Progress towards the next evolution; capped at that stage's threshold. */
  progress: number;
  totalGrowth: number;
  statGrowth: Record<Stat, number>;
}
