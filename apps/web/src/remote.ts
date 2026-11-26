import { migrate, type DayInput, type GameState } from "@pulseling/game";
import type { AdultVariant, DailyHealth, SkillId, Starter, Tactic } from "@pulseling/engine";
import type { ReplyId } from "@pulseling/game";

/**
 * Server mode: open the prototype with `?server=http://127.0.0.1:8787` and the pet lives on apps/server (its local D1)
 * instead of in this browser. Every action goes through the real API; the screen then shows the server's state.
 * Simulated friends aren't on the server yet (step 2), so friend battles stay local and vanish on the next sync.
 */
const KEY = "pulseling-server";

function pickBase(): string | null {
  try {
    const fromUrl = new URLSearchParams(location.search).get("server");
    const prev = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    // "off" only pauses server mode: the account is kept, so ?server=<same address> picks the same pet up again.
    if (fromUrl === "off") { localStorage.setItem(KEY, JSON.stringify({ ...prev, off: true })); return null; }
    if (fromUrl) {
      // Keep the account when the address is the same server; a different server means a different account.
      const base = fromUrl.replace(/\/$/, "");
      localStorage.setItem(KEY, JSON.stringify(prev.base === base ? { ...prev, off: false } : { base }));
      return base;
    }
    return prev.base && !prev.off ? (prev.base as string) : null;
  } catch {
    return null;
  }
}

export const serverBase = pickBase();

interface Saved { base: string; token?: string; persona?: string; off?: boolean }
const read = (): Saved => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return { base: serverBase ?? "" }; } };
const write = (s: Saved) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } };

export class ServerError extends Error {}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { token } = read();
  let res: Response;
  try {
    res = await fetch(serverBase + path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ServerError("连不上服务器");
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ServerError(data?.error?.message ?? `服务器返回 ${res.status}`);
  return data as T;
}

/** The full GameState (dev-only endpoint), so the prototype's screens render exactly what the server holds. */
async function pull(): Promise<GameState> {
  const s = migrate(await api<GameState>("GET", "/v1/dev/state"));
  s.persona = read().persona; // the persona only drives the prototype's fake data; the server doesn't keep it
  return s;
}

export interface LiveEvent { id: string; text: string; start: string; end: string }

export const remote = {
  /** The server's remote config as this player sees it: events running now or soon, and their A/B groups. */
  config: async () => api<{ version: string; events: LiveEvent[]; experiments?: Record<string, string> }>("GET", "/v1/config"),
  /** The saved game, or null when this browser has no account on the server yet. */
  async load(): Promise<GameState | null> {
    if (!read().token) return null;
    try { return await pull(); } catch (e) { if (e instanceof ServerError && /token|pet/i.test(e.message)) return null; throw e; }
  },
  async hatch(starter: Starter, persona: string, installDate: string, history: DailyHealth[]): Promise<GameState> {
    const { userId: _u, token } = await api<{ userId: string; token: string }>("POST", "/v1/accounts");
    write({ ...read(), token, persona });
    await api("POST", "/v1/game", { starter, installDate, history: history.filter((d) => d.worn) });
    return pull();
  },
  async live(s: GameState, health: DayInput): Promise<GameState> {
    await api("POST", "/v1/days", { date: s.today, health });
    return pull();
  },
  /** Lives several days in a row, oldest first, the way the phone uploads after a few days offline. */
  async liveMany(s: GameState, next: (s: GameState) => DayInput, days: number): Promise<GameState> {
    let cur = s;
    for (let i = 0; i < days; i++) cur = await remote.live(cur, next(cur));
    return cur;
  },
  trial: async () => { await api("POST", "/v1/trial"); return pull(); },
  target: async (v: AdultVariant | undefined) => { await api("PUT", "/v1/target", { variant: v ?? null }); return pull(); },
  evolve: async (v: AdultVariant) => { await api("POST", "/v1/evolution", { variant: v }); return pull(); },
  loadout: async (skills: SkillId[], tactic: Tactic) => { await api("PUT", "/v1/loadout", { skills, tactic }); return pull(); },
  chat: async (reply: ReplyId) => { await api("POST", "/v1/chat", { reply }); return pull(); },
  readLetter: async (date: string) => { await api("POST", `/v1/letters/${date}/read`); return pull(); },
  boss: async (charge: number) => { await api("POST", "/v1/boss/fight", { charge }); return pull(); },
  /** Deletes the account and everything stored for it, like the app's "delete all data". */
  async reset() {
    if (read().token) await api("DELETE", "/v1/account").catch(() => undefined);
    write({ base: serverBase ?? "" });
  },
};
