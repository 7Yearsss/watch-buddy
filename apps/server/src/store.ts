import type { DayInput, GameState } from "@pulseling/game";

export interface DayRow {
  date: string;
  input: DayInput;
  /** What POST /v1/days answered for this day; null for days filled in as "not worn". */
  response: unknown | null;
  filled: boolean;
  /** The remote config version this day was settled with (replays use the same one). */
  configVersion: string;
}

export interface ConfigRow {
  version: string;
  /** JSON: { engine?: partial EngineConfig, events?: GameEvent[] } */
  body: string;
}

/** Everything the API needs from storage. D1 in production, an in-memory map in tests. */
export interface Store {
  createUser(id: string, tokenHash: string, now: string): Promise<void>;
  userIdForToken(tokenHash: string): Promise<string | null>;
  getGame(userId: string): Promise<{ state: GameState; rev: number } | null>;
  /** Inserts when `rev` is 0, otherwise updates only if the stored rev still matches. Returns false on a lost race. */
  saveGame(userId: string, state: GameState, rev: number, now: string, days?: DayRow[]): Promise<boolean>;
  getDay(userId: string, date: string): Promise<DayRow | null>;
  listDays(userId: string): Promise<DayRow[]>;
  deleteUser(userId: string): Promise<void>;
  /** The config every settle uses right now, or null for the numbers built into packages/game. */
  activeConfig(): Promise<ConfigRow | null>;
  getConfig(version: string): Promise<ConfigRow | null>;
  /** Store a config version and make it the active one. */
  publishConfig(row: ConfigRow, now: string): Promise<void>;
}

export function d1Store(db: D1Database): Store {
  const dayRow = (r: Record<string, unknown>): DayRow => ({
    date: r.date as string,
    input: JSON.parse(r.input as string),
    response: r.response == null ? null : JSON.parse(r.response as string),
    filled: r.filled === 1,
    configVersion: (r.config_version as string | null) ?? "builtin",
  });
  return {
    async createUser(id, tokenHash, now) {
      await db.prepare("INSERT INTO users (id, token_hash, created_at) VALUES (?, ?, ?)").bind(id, tokenHash, now).run();
    },
    async userIdForToken(tokenHash) {
      const r = await db.prepare("SELECT id FROM users WHERE token_hash = ?").bind(tokenHash).first<{ id: string }>();
      return r?.id ?? null;
    },
    async getGame(userId) {
      const r = await db.prepare("SELECT state, rev FROM games WHERE user_id = ?").bind(userId).first<{ state: string; rev: number }>();
      return r ? { state: JSON.parse(r.state), rev: r.rev } : null;
    },
    async saveGame(userId, state, rev, now, days = []) {
      const json = JSON.stringify(state);
      const writeId = crypto.randomUUID();
      const write =
        rev === 0
          ? db.prepare("INSERT INTO games (user_id, state, rev, write_id, updated_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT(user_id) DO NOTHING").bind(userId, json, writeId, now)
          : db.prepare("UPDATE games SET state = ?, rev = rev + 1, write_id = ?, updated_at = ? WHERE user_id = ? AND rev = ?").bind(json, writeId, now, userId, rev);
      // One transaction. A lost race makes the state write change 0 rows without failing the batch, so each
      // day row is only inserted if the game row now carries this write's id.
      const inserts = days.map((d) =>
        db
          .prepare(
            "INSERT OR REPLACE INTO days (user_id, date, input, response, filled, created_at, config_version) " +
              "SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT write_id FROM games WHERE user_id = ?) = ?",
          )
          .bind(userId, d.date, JSON.stringify(d.input), d.response == null ? null : JSON.stringify(d.response), d.filled ? 1 : 0, now, d.configVersion, userId, writeId),
      );
      const [res] = await db.batch([write, ...inserts]);
      return res!.meta.changes === 1;
    },
    async getDay(userId, date) {
      const r = await db.prepare("SELECT date, input, response, filled, config_version FROM days WHERE user_id = ? AND date = ?").bind(userId, date).first();
      return r ? dayRow(r) : null;
    },
    async listDays(userId) {
      const { results } = await db.prepare("SELECT date, input, response, filled, config_version FROM days WHERE user_id = ? ORDER BY date").bind(userId).all();
      return results.map(dayRow);
    },
    async deleteUser(userId) {
      await db.batch([
        db.prepare("DELETE FROM days WHERE user_id = ?").bind(userId),
        db.prepare("DELETE FROM games WHERE user_id = ?").bind(userId),
        db.prepare("DELETE FROM users WHERE id = ?").bind(userId),
      ]);
    },
    async activeConfig() {
      return (await db.prepare("SELECT version, body FROM configs WHERE active = 1").first<ConfigRow>()) ?? null;
    },
    async getConfig(version) {
      return (await db.prepare("SELECT version, body FROM configs WHERE version = ?").bind(version).first<ConfigRow>()) ?? null;
    },
    async publishConfig(row, now) {
      await db.batch([
        db.prepare("UPDATE configs SET active = 0 WHERE active = 1"),
        db.prepare("INSERT INTO configs (version, body, active, created_at) VALUES (?, ?, 1, ?) ON CONFLICT(version) DO UPDATE SET active = 1").bind(row.version, row.body, now),
      ]);
    },
  };
}

/** For tests and local scripts. Stores copies so callers can't mutate what's "in the database". */
export function memoryStore(): Store {
  const users = new Map<string, string>(); // token hash → user id
  const games = new Map<string, { state: string; rev: number }>();
  const days = new Map<string, Map<string, DayRow>>();
  const configs = new Map<string, ConfigRow>();
  let active: string | null = null;
  const copy = <T>(x: T): T => structuredClone(x);
  return {
    async createUser(id, tokenHash) {
      users.set(tokenHash, id);
    },
    async userIdForToken(tokenHash) {
      return users.get(tokenHash) ?? null;
    },
    async getGame(userId) {
      const g = games.get(userId);
      return g ? { state: JSON.parse(g.state), rev: g.rev } : null;
    },
    async saveGame(userId, state, rev, _now, newDays = []) {
      const g = games.get(userId);
      if (rev === 0 ? g : g?.rev !== rev) return false;
      games.set(userId, { state: JSON.stringify(state), rev: rev + 1 });
      const mine = days.get(userId) ?? new Map<string, DayRow>();
      for (const d of newDays) mine.set(d.date, copy(d));
      days.set(userId, mine);
      return true;
    },
    async getDay(userId, date) {
      const d = days.get(userId)?.get(date);
      return d ? copy(d) : null;
    },
    async listDays(userId) {
      return [...(days.get(userId)?.values() ?? [])].sort((a, b) => a.date.localeCompare(b.date)).map(copy);
    },
    async deleteUser(userId) {
      for (const [hash, id] of users) if (id === userId) users.delete(hash);
      games.delete(userId);
      days.delete(userId);
    },
    async activeConfig() {
      return active ? copy(configs.get(active)!) : null;
    },
    async getConfig(version) {
      const c = configs.get(version);
      return c ? copy(c) : null;
    },
    async publishConfig(row) {
      if (!configs.has(row.version)) configs.set(row.version, copy(row));
      active = row.version;
    },
  };
}
