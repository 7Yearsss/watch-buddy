import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { addDays, daysBetween, knownSkills, validateLoadout, type DailyHealth, type SkillId } from "@pulseling/engine";
import {
  chat,
  chatsLeft,
  chooseEvolution,
  createGame,
  fightBoss,
  liveDay,
  migrate,
  readLetter,
  setLoadout,
  setTarget,
  startTrial,
  status,
  activeConfig,
  BUILTIN_CONFIG,
  mergeEngine,
  assignments,
  withConfig,
  pickLocale,
  raw,
  t,
  type GameConfig,
  type Locale,
  type DayInput,
  type GameState,
} from "@pulseling/game";
import { hashToken, newToken } from "./auth";
import { Account, ApiError, ConfigBody, PublicConfig, Charge, ChatBody, DayResponse, DayUpload, EvolveBody, LoadoutBody, NewGame, PetView, TargetBody } from "./schema";
import type { DayRow, Store } from "./store";
import { petView } from "./view";

export interface Deps {
  store: Store;
  /** Wall clock; injected so tests can pin it. */
  now?: () => Date;
  /**
   * Local development only: allow CORS from the web prototype, skip the "no future days" check so the prototype can
   * fast-forward, and expose GET /v1/dev/state.
   */
  dev?: boolean;
  /**
   * Allows one more account from this caller (Cloudflare rate limiting, keyed by IP). Missing = no limit (tests).
   * A phone makes one account per install, so a handful per minute is plenty.
   */
  allowNewAccount?: (key: string) => Promise<boolean>;
}

const HISTORY_DAYS = 28;
/** Longest gap we fill with "not worn" days in one upload. */
const MAX_GAP_DAYS = 90;
const SAVE_ATTEMPTS = 3;
/** How long one server process keeps using the active config before checking for a newer one. */
const CONFIG_TTL_MS = 60_000;

type Env = { Variables: { userId: string; locale: Locale } };

class ApiFailure extends Error {
  constructor(
    readonly status: 401 | 404 | 409 | 422 | 429,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const err = (description: string) => ({ content: { "application/json": { schema: ApiError } }, description });
const json = <T extends z.ZodType>(schema: T, description: string) => ({ content: { "application/json": { schema } }, description });
const body = <T extends z.ZodType>(schema: T) => ({ body: { content: { "application/json": { schema } }, required: true } });
const authed = { security: [{ bearer: [] }] };
const errors = { 401: err("Missing or unknown token"), 404: err("No pet yet"), 409: err("Conflicts with the current game"), 422: err("Invalid input") };

export function createApp(deps: Deps) {
  const { store, dev = false } = deps;
  const now = deps.now ?? (() => new Date());
  const utcToday = () => now().toISOString().slice(0, 10);

  const app = new OpenAPIHono<Env>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const issue = result.error.issues[0];
        return c.json({ error: { code: "invalid", message: issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "Invalid input" } }, 422);
      }
    },
  });

  if (dev) app.use("*", cors({ origin: (o) => o, allowHeaders: ["authorization", "content-type"], allowMethods: ["GET", "POST", "PUT", "DELETE"] }));

  app.onError((e, c) => {
    if (e instanceof ApiFailure) return c.json({ error: { code: e.code, message: e.message } }, e.status);
    console.error(e);
    return c.json({ error: { code: "internal", message: "Something went wrong" } }, 500);
  });
  app.notFound((c) => c.json({ error: { code: "not_found", message: "No such endpoint" } }, 404));

  app.openAPIRegistry.registerComponent("securitySchemes", "bearer", { type: "http", scheme: "bearer" });

  // Game text comes back in one language (decision 6, option B): ?lang= wins, then Accept-Language, else Chinese.
  app.use("*", async (c, next) => {
    const locale = pickLocale(c.req.query("lang") ?? c.req.header("accept-language"));
    c.set("locale", locale);
    await next();
    c.header("Content-Language", locale === "zh" ? "zh-Hans" : locale);
    c.header("Vary", "Accept-Language", { append: true });
  });

  // Every /v1 route except creating an account needs the bearer token.
  app.use("/v1/*", async (c, next) => {
    if (c.req.method === "POST" && c.req.path === "/v1/accounts") return next();
    if (c.req.method === "GET" && c.req.path === "/v1/config") return next();
    if (c.req.method === "OPTIONS") return next();
    const token = c.req.header("authorization")?.match(/^Bearer (.+)$/)?.[1];
    const userId = token ? await store.userIdForToken(await hashToken(token)) : null;
    if (!userId) throw new ApiFailure(401, "unauthorized", "Missing or unknown token");
    c.set("userId", userId);
    await next();
  });

  const load = async (userId: string) => {
    const g = await store.getGame(userId);
    if (!g) throw new ApiFailure(404, "no_game", "This account has no pet yet");
    return { state: migrate(g.state), rev: g.rev };
  };

  /** Remote config on top of the built-in numbers; cached briefly so a settle costs no extra read. */
  let cached: { config: GameConfig; at: number } | null = null;
  async function config(): Promise<GameConfig> {
    if (cached && now().getTime() - cached.at < CONFIG_TTL_MS) return cached.config;
    const row = await store.activeConfig();
    let conf = BUILTIN_CONFIG;
    if (row) {
      const body = ConfigBody.safeParse(JSON.parse(row.body));
      if (body.success) conf = { version: row.version, engine: mergeEngine(BUILTIN_CONFIG.engine, body.data.engine as never), events: body.data.events, flags: body.data.flags, copy: body.data.copy };
      else console.error(`config ${row.version} is invalid, using built-in numbers`, body.error.issues[0]);
    }
    cached = { config: conf, at: now().getTime() };
    return conf;
  }
  /** Game rules read the config through a synchronous scope (packages/game withConfig). */
  const rules = async <T>(run: () => T) => withConfig(await config(), run);

  /** Read → change → write with optimistic locking; retried when another request saved in between. */
  async function mutate<R>(userId: string, change: (s: GameState) => { state: GameState; days?: DayRow[]; result: R } | { done: R }): Promise<R> {
    for (let i = 0; i < SAVE_ATTEMPTS; i++) {
      const { state, rev } = await load(userId);
      const out = await rules(() => change(state));
      if ("done" in out) return out.done;
      if (await store.saveGame(userId, out.state, rev, now().toISOString(), out.days)) return out.result;
    }
    throw new ApiFailure(409, "busy", "The game changed while saving; try again");
  }
  const viewAfter = (locale: Locale, userId: string, change: (s: GameState) => GameState) => mutate(userId, (s) => { const state = change(s); return { state, result: petView(state, locale) }; });

  // ───── accounts ─────

  app.openapi(
    createRoute({ method: "post", path: "/v1/accounts", operationId: "createAccount", summary: "Create an anonymous account", responses: { 201: json(Account, "Keep the token in the Keychain"), 429: err("Too many new accounts from this network; retry in a minute") } }),
    async (c) => {
      const caller = c.req.header("cf-connecting-ip") ?? "local";
      if (deps.allowNewAccount && !(await deps.allowNewAccount(`accounts:${caller}`))) throw new ApiFailure(429, "slow_down", "Too many new accounts from this network; try again in a minute");
      const userId = crypto.randomUUID();
      const token = newToken();
      await store.createUser(userId, await hashToken(token), now().toISOString());
      return c.json({ userId, token }, 201);
    },
  );

  app.openapi(
    createRoute({ method: "delete", path: "/v1/account", operationId: "deleteAccount", summary: "Delete the account and every byte stored for it", ...authed, responses: { 204: { description: "Deleted" }, 401: errors[401] } }),
    async (c) => {
      await store.deleteUser(c.get("userId"));
      return c.body(null, 204);
    },
  );

  // ───── the pet ─────

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/game",
      operationId: "createGame",
      summary: "Hatch: pick an egg, send up to 28 days of history",
      ...authed,
      request: body(NewGame),
      responses: { 201: json(PetView, "The new pet"), 401: errors[401], 409: err("Already hatched"), 422: errors[422] },
    }),
    async (c) => {
      const userId = c.get("userId");
      const { starter, installDate, history } = c.req.valid("json");
      if (!dev && Math.abs(daysBetween(utcToday(), installDate)) > 1) throw new ApiFailure(422, "bad_date", "installDate must be the phone's current date");
      const given = new Map(history.map((d) => [d.date, d]));
      const full: DailyHealth[] = [];
      for (let i = HISTORY_DAYS; i > 0; i--) {
        const date = addDays(installDate, -i);
        full.push(given.get(date) ?? { date, worn: false });
      }
      const { state, view } = await rules(() => {
        const state = createGame({ userId, starter, installDate, history: full });
        return { state, view: petView(state, c.get("locale")) };
      });
      if (!(await store.saveGame(userId, state, 0, now().toISOString()))) throw new ApiFailure(409, "already_hatched", "This account already has a pet");
      return c.json(view, 201);
    },
  );

  app.openapi(
    createRoute({ method: "get", path: "/v1/game", operationId: "getGame", summary: "Current pet, for the phone, watch and widgets", ...authed, responses: { 200: json(PetView, "Current view"), 401: errors[401], 404: errors[404] } }),
    async (c) => {
      const { state } = await load(c.get("userId"));
      return c.json(await rules(() => petView(state, c.get("locale"))), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/days",
      operationId: "uploadDay",
      summary: "Upload one finished day and get the morning card",
      description:
        "Upload days oldest first. Re-sending a settled day returns the same answer. Days skipped before `date` are settled as not worn. " +
        "A day that was already settled as not worn can't be uploaded afterwards (409 day_closed).",
      ...authed,
      request: body(DayUpload),
      responses: { 200: json(DayResponse, "Settled"), 401: errors[401], 404: errors[404], 409: errors[409], 422: errors[422] },
    }),
    async (c) => {
      const userId = c.get("userId");
      const { date, health } = c.req.valid("json");
      if (!dev && date > utcToday()) throw new ApiFailure(422, "future_date", "That day hasn't ended yet");
      const first = await load(userId);
      if (date < first.state.today) {
        const row = await store.getDay(userId, date);
        if (row?.response) return c.json(row.response as z.infer<typeof DayResponse>, 200);
        throw new ApiFailure(409, "day_closed", `Days before ${first.state.today} are already settled`);
      }
      if (daysBetween(first.state.today, date) > MAX_GAP_DAYS) throw new ApiFailure(422, "gap_too_long", `Upload days from ${first.state.today} onwards`);

      const result = await mutate(userId, (s) => {
        if (date < s.today) return { done: null }; // another request settled it meanwhile
        const days: DayRow[] = [];
        const configVersion = activeConfig().version;
        while (s.today < date) {
          days.push({ date: s.today, input: { worn: false }, response: null, filled: true, configVersion });
          s = liveDay(s, { worn: false });
        }
        s = liveDay(s, health as DayInput);
        const view = petView(s, c.get("locale"));
        const response = { date, card: view.card, view };
        days.push({ date, input: health as DayInput, response, filled: false, configVersion });
        return { state: s, days, result: response };
      });
      if (result) return c.json(result, 200);
      const row = await store.getDay(userId, date);
      if (row?.response) return c.json(row.response as z.infer<typeof DayResponse>, 200);
      throw new ApiFailure(409, "day_closed", "That day was settled as not worn");
    },
  );

  app.openapi(
    createRoute({ method: "post", path: "/v1/boss/fight", operationId: "fightBoss", summary: "Fight this week's boss (the watch tap)", ...authed, request: body(Charge), responses: { 200: json(PetView, "Fought"), 401: errors[401], 404: errors[404], 409: err("No boss waiting today") } }),
    async (c) => {
      const { charge } = c.req.valid("json");
      return c.json(
        await viewAfter(c.get("locale"), c.get("userId"), (s) => {
          if (!s.bossPending || s.bossPending.date !== s.today) throw new ApiFailure(409, "no_boss", "No boss is waiting today");
          return fightBoss(s, charge);
        }),
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/v1/trial",
      operationId: "startTrial",
      summary: "Start the Plus trial",
      description: "Placeholder until StoreKit: marks the trial active. Later the trial comes from a verified App Store transaction.",
      ...authed,
      responses: { 200: json(PetView, "Trial active"), 401: errors[401], 404: errors[404] },
    }),
    async (c) => c.json(await viewAfter(c.get("locale"), c.get("userId"), (s) => (s.trial === "active" ? s : startTrial(s))), 200),
  );

  app.openapi(
    createRoute({ method: "post", path: "/v1/chat", operationId: "chat", summary: "Say one of today's 3 lines to the pet", ...authed, request: body(ChatBody), responses: { 200: json(PetView, "Answered"), 401: errors[401], 404: errors[404], 409: err("No chats left today") } }),
    async (c) => {
      const { reply } = c.req.valid("json");
      return c.json(
        await viewAfter(c.get("locale"), c.get("userId"), (s) => {
          if (chatsLeft(s) <= 0) throw new ApiFailure(409, "no_chats", "No chats left today");
          return chat(s, reply);
        }),
        200,
      );
    },
  );

  app.openapi(
    createRoute({ method: "post", path: "/v1/letters/{date}/read", operationId: "readLetter", summary: "Mark a letter read", ...authed, request: { params: z.object({ date: z.string() }) }, responses: { 200: json(PetView, "Marked"), 401: errors[401], 404: errors[404] } }),
    async (c) => {
      const { date } = c.req.valid("param");
      return c.json(await viewAfter(c.get("locale"), c.get("userId"), (s) => readLetter(s, date)), 200);
    },
  );

  app.openapi(
    createRoute({ method: "put", path: "/v1/loadout", operationId: "setLoadout", summary: "Skills and tactic for battles", ...authed, request: body(LoadoutBody), responses: { 200: json(PetView, "Saved"), 401: errors[401], 404: errors[404], 422: errors[422] } }),
    async (c) => {
      const { skills, tactic } = c.req.valid("json");
      return c.json(
        await viewAfter(c.get("locale"), c.get("userId"), (s) => {
          const problem = validateLoadout(s.pet, skills as SkillId[], knownSkills(s.pet, s.learned));
          if (problem) throw new ApiFailure(422, "bad_loadout", problem);
          return setLoadout(s, skills as SkillId[], tactic);
        }),
        200,
      );
    },
  );

  app.openapi(
    createRoute({ method: "put", path: "/v1/target", operationId: "setTarget", summary: "Pick (or clear) the adult form to aim for", ...authed, request: body(TargetBody), responses: { 200: json(PetView, "Saved"), 401: errors[401], 404: errors[404] } }),
    async (c) => {
      const { variant } = c.req.valid("json");
      return c.json(await viewAfter(c.get("locale"), c.get("userId"), (s) => setTarget(s, variant ?? undefined)), 200);
    },
  );

  app.openapi(
    createRoute({ method: "post", path: "/v1/evolution", operationId: "evolve", summary: "Evolve now into one of the forms whose conditions are met", ...authed, request: body(EvolveBody), responses: { 200: json(PetView, "Evolved"), 401: errors[401], 404: errors[404], 409: err("Not ready, or that form's conditions aren't met") } }),
    async (c) => {
      const { variant } = c.req.valid("json");
      return c.json(
        await viewAfter(c.get("locale"), c.get("userId"), (s) => {
          const st = status(s);
          const option = st.options.find((o) => o.variant === variant);
          if (!st.ready || !option?.met) throw new ApiFailure(409, "cannot_evolve", "Not ready to evolve into that form");
          return chooseEvolution(s, variant);
        }),
        200,
      );
    },
  );

  app.openapi(
    createRoute({ method: "get", path: "/v1/config", operationId: "getConfig", summary: "Config version and the events running now or coming up (for banners)", responses: { 200: json(PublicConfig, "Current config") } }),
    async (c) => {
      const conf = await config();
      const today = utcToday();
      const locale = c.get("locale");
      const events = withConfig(conf, () => conf.events.filter((e) => e.end >= today).map(({ id, text, start, end }) => ({ id, text: t(raw(text), locale), start, end })));
      // Public, but with a token it also says which A/B groups this player is in.
      const token = c.req.header("authorization")?.match(/^Bearer (.+)$/)?.[1];
      const userId = token ? await store.userIdForToken(await hashToken(token)) : null;
      return c.json({ version: conf.version, events, ...(userId ? { experiments: assignments(userId, conf) } : {}) }, 200);
    },
  );

  // ───── transparency ─────

  app.openapi(
    createRoute({
      method: "get",
      path: "/v1/data",
      operationId: "getData",
      summary: "Everything uploaded, exactly as stored (the in-app data page)",
      ...authed,
      responses: { 200: json(z.object({ history: z.array(z.record(z.string(), z.unknown())), uploads: z.array(z.object({ date: z.string(), health: z.record(z.string(), z.unknown()), filled: z.boolean() })) }), "Stored data"), 401: errors[401] },
    }),
    async (c) => {
      const userId = c.get("userId");
      const g = await store.getGame(userId);
      const days = await store.listDays(userId);
      return c.json({ history: (g?.state.history ?? []).filter((d) => d.date < (g?.state.installDate ?? "")) as unknown as Record<string, unknown>[], uploads: days.map((d) => ({ date: d.date, health: d.input as Record<string, unknown>, filled: d.filled })) }, 200);
    },
  );

  if (dev) app.get("/v1/dev/state", async (c) => c.json((await load(c.get("userId"))).state));

  app.get("/health", (c) => c.json({ ok: true }));
  app.doc31("/openapi.json", { openapi: "3.1.0", info: { title: "Pulseling API", version: "0.1.0" } });

  return app;
}
