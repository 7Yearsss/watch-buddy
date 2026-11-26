import { describe, expect, it } from "vitest";
import { addDays, type DailyHealth } from "@pulseling/engine";
import { createGame, fightBoss, liveDay, startTrial, t as render, type GameState } from "@pulseling/game";
import { makeDays, makeUser } from "@pulseling/sim/personas";
import { createApp } from "../src/app";
import { memoryStore } from "../src/store";

const INSTALL = "2026-01-05";

/** A fresh server with an in-memory database and a clock the test moves by hand. */
function setup(today = INSTALL) {
  const store = memoryStore();
  let clock = today;
  const app = createApp({ store, now: () => new Date(`${clock}T12:00:00Z`) });
  let token = "";
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  };
  const signUp = async () => {
    const r = await call("POST", "/v1/accounts");
    expect(r.status).toBe(201);
    token = r.body.token;
    return r.body.userId as string;
  };
  return { store, call, signUp, setNow: (d: string) => void (clock = d) };
}

const strip = ({ date: _d, ...rest }: DailyHealth) => rest;

describe("API", () => {
  it("needs a token", async () => {
    const { call } = setup();
    expect((await call("GET", "/v1/game")).status).toBe(401);
  });

  it("plays 30 days exactly like packages/game does locally", async () => {
    const t = setup();
    const userId = await t.signUp();
    const user = makeUser(3, "api-test");
    const history = makeDays(user, addDays(INSTALL, -28), 28, userId);
    expect((await t.call("POST", "/v1/game", { starter: "fire", installDate: INSTALL, history })).status).toBe(201);

    let local: GameState = createGame({ userId, starter: "fire", installDate: INSTALL, history });
    for (const day of makeDays(user, INSTALL, 30, userId)) {
      t.setNow(day.date); // the evening of that day
      if (day.date === addDays(INSTALL, 3)) {
        local = startTrial(local);
        expect((await t.call("POST", "/v1/trial")).status).toBe(200);
      }
      if (local.bossPending?.date === local.today) {
        local = fightBoss(local, 0.5);
        expect((await t.call("POST", "/v1/boss/fight", { charge: 0.5 })).status).toBe(200);
      }
      local = liveDay(local, strip(day));
      t.setNow(addDays(day.date, 1));
      expect((await t.call("POST", "/v1/days", { date: day.date, health: strip(day) })).status).toBe(200);
    }
    expect((await t.store.getGame(userId))!.state).toEqual(JSON.parse(JSON.stringify(local)));
    expect(local.bosses.length).toBeGreaterThan(0);
  });

  it("answers a retried upload with the same response", async () => {
    const t = setup("2026-01-20");
    await t.signUp();
    await t.call("POST", "/v1/game", { starter: "water", installDate: "2026-01-19", history: [] });
    const first = await t.call("POST", "/v1/days", { date: "2026-01-19", health: { worn: true, steps: 9000, sleepMinutes: 450 } });
    expect(first.status).toBe(200);
    const again = await t.call("POST", "/v1/days", { date: "2026-01-19", health: { worn: true, steps: 1 } });
    expect(again.body).toEqual(first.body);
  });

  it("refuses days that haven't ended and hatch dates that aren't today", async () => {
    const t = setup("2026-02-10");
    await t.signUp();
    expect((await t.call("POST", "/v1/game", { starter: "fire", installDate: "2026-02-01", history: [] })).body.error.code).toBe("bad_date");
    await t.call("POST", "/v1/game", { starter: "fire", installDate: "2026-02-10", history: [] });
    expect((await t.call("POST", "/v1/days", { date: "2026-02-11", health: { worn: true } })).body.error.code).toBe("future_date");
  });

  it("settles skipped days as not worn, then refuses them", async () => {
    const t = setup("2026-02-04");
    const userId = await t.signUp();
    await t.call("POST", "/v1/game", { starter: "fire", installDate: "2026-02-04", history: [] });
    t.setNow("2026-02-08");
    const r = await t.call("POST", "/v1/days", { date: "2026-02-07", health: { worn: true, steps: 8000 } });
    expect(r.status).toBe(200);
    expect(r.body.view.today).toBe("2026-02-08");
    expect((await t.store.listDays(userId)).map((d) => [d.date, d.filled])).toEqual([
      ["2026-02-04", true],
      ["2026-02-05", true],
      ["2026-02-06", true],
      ["2026-02-07", false],
    ]);
    const late = await t.call("POST", "/v1/days", { date: "2026-02-05", health: { worn: true, steps: 8000 } });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("day_closed");
  });

  it("rejects impossible health values", async () => {
    const t = setup();
    await t.signUp();
    await t.call("POST", "/v1/game", { starter: "fire", installDate: INSTALL, history: [] });
    const r = await t.call("POST", "/v1/days", { date: INSTALL, health: { worn: true, steps: -5 } });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("invalid");
  });

  it("only fights a waiting boss and only evolves when ready", async () => {
    const t = setup();
    await t.signUp();
    await t.call("POST", "/v1/game", { starter: "fire", installDate: INSTALL, history: [] });
    expect((await t.call("POST", "/v1/boss/fight", { charge: 1 })).body.error.code).toBe("no_boss");
    expect((await t.call("POST", "/v1/evolution", { variant: "flying" })).body.error.code).toBe("cannot_evolve");
  });

  it("hatches once, and deletes everything on request", async () => {
    const t = setup();
    const userId = await t.signUp();
    expect((await t.call("POST", "/v1/game", { starter: "fire", installDate: INSTALL, history: [] })).status).toBe(201);
    expect((await t.call("POST", "/v1/game", { starter: "fire", installDate: INSTALL, history: [] })).status).toBe(409);
    expect((await t.call("DELETE", "/v1/account")).status).toBe(204);
    expect(await t.store.getGame(userId)).toBeNull();
    expect((await t.call("GET", "/v1/game")).status).toBe(401);
  });

  it("publishes an OpenAPI document", async () => {
    const { call } = setup();
    const doc = await call("GET", "/openapi.json");
    expect(doc.status).toBe(200);
    expect(Object.keys(doc.body.paths)).toContain("/v1/days");
  });
});

describe("remote config", () => {
  it("applies an event to the mornings it covers, records the version, and lists it publicly", async () => {
    const t = setup("2026-02-01");
    const userId = await t.signUp();
    await t.store.publishConfig(
      {
        version: "snow-1",
        body: JSON.stringify({ events: [{ id: "snow", text: "初雪周：水系野怪变多了", start: "2026-02-02", end: "2026-02-20", effect: { weather: "water", encounterChance: 3 } }] }),
      },
      "2026-02-01T00:00:00Z",
    );
    expect((await t.call("GET", "/v1/config")).body).toMatchObject({ version: "snow-1", events: [{ id: "snow", text: "初雪周：水系野怪变多了", start: "2026-02-02", end: "2026-02-20" }] });
    await t.call("POST", "/v1/game", { starter: "fire", installDate: "2026-02-01", history: [] });
    t.setNow("2026-02-02");
    const r = await t.call("POST", "/v1/days", { date: "2026-02-01", health: { worn: true, steps: 9000 } });
    const card = r.body.card;
    const extras: string[] = card.extras.map((x: { text: string }) => x.text);
    const state = (await t.store.getGame(userId))!.state;
    expect(state.configLog.at(-1)).toEqual({ from: "2026-02-01", version: "snow-1" });
    expect((await t.store.getDay(userId, "2026-02-01"))!.configVersion).toBe("snow-1");
    // the event shows up on the card unless a guest monster took the morning
    expect(extras.some((x) => x.startsWith("初雪周")) || state.morning!.boosts.some((b) => render(b).includes("借宿"))).toBe(true);
  });

  it("falls back to the built-in numbers when the active config is broken", async () => {
    const t = setup();
    await t.signUp();
    await t.store.publishConfig({ version: "bad", body: JSON.stringify({ events: [{ id: "x" }] }) }, "2026-01-01T00:00:00Z");
    expect((await t.call("POST", "/v1/game", { starter: "fire", installDate: INSTALL, history: [] })).status).toBe(201);
    expect((await t.call("GET", "/v1/config")).body.version).toBe("builtin");
  });
});

describe("flags", () => {
  it("splits players into stable A/B groups and moves the first invitation", async () => {
    const { variantOf, flag, BUILTIN_CONFIG } = await import("@pulseling/game");
    const conf = { ...BUILTIN_CONFIG, version: "ab", flags: { firstInviteDay: { variants: { day3: 3, day6: 6 } } } };
    const groups = Array.from({ length: 1000 }, (_, i) => variantOf("firstInviteDay", `u${i}`, conf));
    const day6 = groups.filter((g) => g === "day6").length;
    expect(day6).toBeGreaterThan(400);
    expect(day6).toBeLessThan(600);
    expect(variantOf("firstInviteDay", "u1", conf)).toBe(variantOf("firstInviteDay", "u1", conf));
    expect(flag("missing", "u1", 3, conf)).toBe(3);

    const t = setup();
    const userId = await t.signUp();
    await t.store.publishConfig({ version: "ab", body: JSON.stringify({ flags: conf.flags }) }, "2026-01-01T00:00:00Z");
    const mine = (await t.call("GET", "/v1/config")).body.experiments.firstInviteDay;
    expect(mine).toBe(variantOf("firstInviteDay", userId, conf));
    await t.call("POST", "/v1/game", { starter: "fire", installDate: INSTALL, history: [] });
    const invites: (string | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(INSTALL, i);
      t.setNow(addDays(date, 1));
      invites.push((await t.call("POST", "/v1/days", { date, health: { worn: true, steps: 8000 } })).body.view.invite);
    }
    const talkDay = invites.indexOf("talk") + 1; // invites[i] is the view on day i + 1
    expect(talkDay).toBe(mine === "day3" ? 3 : 6);
  });
});

describe("abuse", () => {
  it("rate-limits new accounts", async () => {
    let left = 2;
    const app = createApp({ store: memoryStore(), allowNewAccount: async () => left-- > 0 });
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await app.request("/v1/accounts", { method: "POST" })).status);
    expect(codes).toEqual([201, 201, 429]);
  });
});

describe("languages", () => {
  const CJK = /[一-鿿]/;
  async function played(before?: (t: ReturnType<typeof setup>) => Promise<void>) {
    const t = setup();
    await before?.(t);
    const userId = await t.signUp();
    const user = makeUser(5, "lang-test");
    await t.call("POST", "/v1/game", { starter: "grass", installDate: INSTALL, history: makeDays(user, addDays(INSTALL, -28), 28, userId) });
    for (const day of makeDays(user, INSTALL, 15, userId)) {
      t.setNow(day.date);
      await t.call("POST", "/v1/days", { date: day.date, health: strip(day) });
      await t.call("POST", "/v1/boss/fight", { charge: 0.5 });
    }
    await t.call("POST", "/v1/chat", { reply: "tired" });
    return t;
  }

  it("says the same save in the language the request asks for", async () => {
    const t = await played();
    const zh = await t.call("GET", "/v1/game");
    const en = await t.call("GET", "/v1/game", undefined, { "accept-language": "en-GB,en;q=0.9" });
    expect(zh.body.locale).toBe("zh");
    expect(en.body.locale).toBe("en");
    expect(en.headers.get("content-language")).toBe("en");
    expect(en.headers.get("vary")).toMatch(/accept-language/i);
    expect(zh.body.feed.length).toBe(en.body.feed.length);
    expect(JSON.stringify(zh.body.feed)).toMatch(CJK);
    const text = JSON.stringify({ card: en.body.card, feed: en.body.feed, letters: en.body.letters, chat: en.body.chat, wish: en.body.wish, replies: en.body.replies, memories: en.body.memories, collection: en.body.collection, dexNames: en.body.dexNames, line: en.body.line, short: en.body.short });
    expect(text).not.toMatch(CJK);
    expect(en.body.letters[0].text).toMatch(/boss/i);
    expect(en.body.chat.map((c: { text: string }) => c.text)[0]).toBe("I'm so tired today");
    // ?lang= beats the header (handy for a browser or a debug link)
    expect((await t.call("GET", "/v1/game?lang=en", undefined, { "accept-language": "zh-CN" })).body.locale).toBe("en");
  });

  it("takes copy overrides and per-language event text from remote config", async () => {
    // Published before the first request: servers cache the active config for a minute.
    const t = await played((t) =>
      t.store.publishConfig(
      {
        version: "copy-1",
        body: JSON.stringify({
          events: [{ id: "snow", text: { zh: "初雪周", en: "First Snow Week" }, start: "2026-01-01", end: "2026-12-31", effect: {} }],
          copy: { en: { "feed.letter": "You've got mail!" } },
        }),
      },
      "2026-01-01T00:00:00Z",
      ),
    );
    const en = await t.call("GET", "/v1/game", undefined, { "accept-language": "en" });
    expect(en.body.feed.map((f: { text: string }) => f.text)).toContain("You've got mail!");
    expect((await t.call("GET", "/v1/config", undefined, { "accept-language": "en" })).body.events[0].text).toBe("First Snow Week");
    expect((await t.call("GET", "/v1/config")).body.events[0].text).toBe("初雪周");
  });
});
