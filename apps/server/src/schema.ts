import { z } from "@hono/zod-openapi";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD").openapi({ example: "2026-11-24" });
const n = (max: number, min = 0) => z.number().min(min).max(max).optional();

/**
 * One day of health data, summarised on the phone (docs/design/03, 11). Mirrors `DailyHealth` in packages/engine.
 * Bounds only reject values no real day can have; the engine applies its own per-metric caps on top.
 */
export const DayHealth = z
  .object({
    worn: z.boolean().openapi({ description: "Watch worn ~4 h in the daytime, or ≥ 1,500 steps on any device" }),
    steps: n(150_000),
    standHours: n(24),
    activeEnergyKcal: n(15_000),
    flightsClimbed: n(1_000),
    sleepMinutes: n(1_440),
    bedtimeMinutes: n(720, -720).openapi({ description: "First sleep relative to midnight, 23:30 → -30" }),
    deepSleepRatio: n(1),
    nightHrvMs: n(400),
    restingHr: n(250, 20),
    highHrZoneMinutes: n(1_440),
    intervalMinutes: n(1_440),
    strengthMinutes: n(1_440),
    highIntensityMinutes: n(1_440),
    cardioMinutes: n(1_440),
    distanceKm: n(500),
  })
  .strict()
  .openapi("DayHealth");

export const DatedHealth = DayHealth.extend({ date }).openapi("DatedHealth");

export const NewGame = z
  .object({
    starter: z.enum(["grass", "water", "fire"]),
    installDate: date.openapi({ description: "The phone's local date at hatch" }),
    history: z.array(DatedHealth).max(28).openapi({ description: "Up to 28 days before installDate. Missing days count as not worn (Health access denied → send [])" }),
  })
  .openapi("NewGame");

export const DayUpload = z.object({ date, health: DayHealth }).openapi("DayUpload");

export const Charge = z.object({ charge: z.number().min(0).max(1).openapi({ description: "The watch tap, 0–1" }) }).openapi("Charge");
export const ChatBody = z.object({ reply: z.enum(["pet", "cheer", "sleep-early", "move", "tired"]) }).openapi("Chat");
export const LoadoutBody = z.object({ skills: z.array(z.string()).length(4), tactic: z.enum(["aggressive", "balanced", "cautious"]) }).openapi("Loadout");
const variant = z.enum(["pure", "flying", "fighting", "electric", "ground", "shadow", "dragon"]);
export const TargetBody = z.object({ variant: variant.nullable() }).openapi("Target");
export const EvolveBody = z.object({ variant }).openapi("Evolve");

export const Account = z.object({ userId: z.string(), token: z.string() }).openapi("Account");

export const ApiError = z
  .object({ error: z.object({ code: z.string(), message: z.string() }) })
  .openapi("Error");

/**
 * What the phone, watch and widgets render. All game text is already sentences in the request's language (?lang= or
 * Accept-Language; see `locale`). Fixed UI words (buttons, titles) are the app's own String Catalog.
 */
export const PetView = z
  .object({
    today: date.openapi({ description: "The next day the server expects data for" }),
    dayNumber: z.number().int(),
    pet: z.record(z.string(), z.unknown()),
    evolution: z.record(z.string(), z.unknown()),
    condition: z.number(),
    card: z.record(z.string(), z.unknown()).nullable().openapi({ description: "This morning's card; null before the first day is settled" }),
    locale: z.enum(["zh", "en"]).openapi({ description: "Language of every text field in this view" }),
    line: z.string().nullable().openapi({ description: "Something the pet wants to say first thing" }),
    short: z.string().nullable().openapi({ description: "Watch-sized line" }),
    bossPending: z.object({ date, type: z.string() }).nullable(),
    lastBoss: z.record(z.string(), z.unknown()).nullable(),
    lastBossName: z.string().nullable(),
    wish: z
      .object({ date, kind: z.string(), target: z.number(), label: z.string(), text: z.string(), short: z.string(), kept: z.boolean().optional() })
      .nullable()
      .openapi({ description: "Today's optional wish" }),
    letters: z.array(z.object({ date, text: z.string(), read: z.boolean() })),
    feed: z.array(z.object({ date, text: z.string(), kind: z.string() })),
    chat: z.array(z.object({ from: z.enum(["me", "pet"]), text: z.string() })).openapi({ description: "Today's exchanges" }),
    replies: z.array(z.object({ id: z.string(), label: z.string() })).openapi({ description: "The quick replies, for POST /v1/chat" }),
    memories: z.array(z.object({ date, text: z.string() })),
    dex: z.record(z.string(), z.unknown()),
    dexNames: z.record(z.string(), z.string()).openapi({ description: "Species id → name" }),
    collection: z.array(z.object({ id: z.string(), name: z.string(), count: z.number().int() })),
    loadout: z.array(z.string()),
    tactic: z.string(),
    chatsLeft: z.number().int(),
    trial: z.enum(["none", "active"]),
    invite: z.enum(["talk", "letter", "evolve"]).nullable().openapi({ description: "Show a soft Plus invitation today (never blocks play)" }),
  })
  .openapi("PetView");

export const DayResponse = z.object({ date, card: PetView.shape.card, view: PetView }).openapi("DayResponse");

const localeText = z.union([z.string().min(1).max(80), z.object({ zh: z.string().min(1).max(80), en: z.string().min(1).max(120).optional() })]);

const eventSchema = z.object({
  id: z.string().min(1),
  text: localeText.openapi({ description: "One string (Chinese) or one per language" }),
  start: date,
  end: date,
  effect: z.object({
    encounterChance: z.number().min(0.5).max(3).optional(),
    weather: z.enum(["grass", "water", "fire", "electric", "ground", "fighting", "flying", "shadow"]).optional(),
  }),
});

/** A remote config file (apps/server/config/*.json). `engine` overrides only the numbers it names. */
export const ConfigBody = z.object({
  engine: z.record(z.string(), z.unknown()).optional(),
  events: z.array(eventSchema).default([]),
  flags: z
    .record(z.string(), z.object({ variants: z.record(z.string(), z.unknown()), weights: z.record(z.string(), z.number().min(0)).optional() }))
    .default({}),
  /** Copy overrides: language → key → template (keys and params as in packages/game/src/copy). */
  copy: z.object({ zh: z.record(z.string(), z.string()).optional(), en: z.record(z.string(), z.string()).optional() }).optional(),
});

export const PublicConfig = z
  .object({
    version: z.string(),
    events: z.array(z.object({ id: z.string(), text: z.string(), start: date, end: date })),
    experiments: z.record(z.string(), z.string()).optional().openapi({ description: "With a token: flag → this player's variant" }),
  })
  .openapi("Config");
