import { addDays, daysBetween, type AdultVariant, type DailyHealth, type Starter } from "@pulseling/engine";
import { chooseEvolution, createGame, fightFriend as fightSnapshot, liveDay, migrate, snapshotOf, startTrial, status, type DayInput, type GameState } from "@pulseling/game";
import { makeDay, PERSONAS, type PersonaId, type SimUser } from "@pulseling/sim/personas";

/** Prototype layer: simulated personas instead of HealthKit, localStorage instead of a server, simulated friends. */
export * from "@pulseling/game";

const HISTORY_DAYS = 28;
const STORAGE_KEY = "pulseling-prototype-v1";

function simUser(state: Pick<GameState, "userId" | "persona">, starter: Starter): SimUser {
  return {
    id: state.userId,
    persona: PERSONAS.find((p) => p.id === state.persona) ?? PERSONAS[0]!,
    starter,
    traits: { hrv: 45, restingHr: 63, bedtime: -20, deepRatio: 0.16, stepScale: 1 },
    // Fast-forward keeps sleep data; the "戴着睡觉" switch in the side panel tries a night off the wrist.
    nightWearer: true,
  };
}

export function personaDay(state: Pick<GameState, "userId" | "persona" | "installDate">, starter: Starter, date: string): DayInput {
  const index = daysBetween(addDays(state.installDate, -HISTORY_DAYS), date);
  const { date: _date, ...rest } = makeDay(simUser(state, starter), date, index, state.userId);
  return rest;
}

/** `denied`: the player declined Health access. HealthKit doesn't tell apps a read was denied, it just returns nothing. */
export function newGame(starter: Starter, persona: PersonaId, installDate = new Date().toISOString().slice(0, 10), fixedId?: string, denied = false): GameState {
  const userId = fixedId ?? `proto-${Math.random().toString(36).slice(2, 10)}`;
  const base = { userId, persona, installDate };
  const history: DailyHealth[] = [];
  for (let i = HISTORY_DAYS; i > 0; i--) {
    const date = addDays(installDate, -i);
    history.push(denied ? { date, worn: false } : { date, ...personaDay(base, starter, date) });
  }
  return createGame({ userId, starter, installDate, history, persona });
}

export function save(s: GameState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

export function load(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? migrate(JSON.parse(raw) as GameState) : null;
  } catch {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
}

/** Prototype friends: simulated players living the same days with different habits. */
export interface Friend { id: string; name: string; persona: PersonaId; starter: Starter }
export const FRIENDS: Friend[] = [
  { id: "f-runner", name: "阿跑", persona: "runner", starter: "water" },
  { id: "f-lifter", name: "大力", persona: "lifter", starter: "fire" },
  { id: "f-sleepy", name: "小懒", persona: "sedentary", starter: "grass" },
];

const friendCache = new Map<string, GameState>();

/** The friend's game as of the player's current day (what their last sync would show). */
export function friendState(s: GameState, f: Friend): GameState {
  const key = `${f.id}:${s.installDate}:${s.today}`;
  const hit = friendCache.get(key);
  if (hit) return hit;
  let fs = newGame(f.starter, f.persona, s.installDate, `${f.id}-${s.installDate}`);
  while (fs.today < s.today) {
    fs = liveDay(fs, personaDay(fs, f.starter, fs.today));
    fs = friendPicksEvolution(fs);
  }
  friendCache.set(key, fs);
  return fs;
}

/** Simulated friends pick a form like a real player would: a met favourite right away, otherwise pure after a while. */
const FRIEND_PREFERENCE: AdultVariant[] = ["dragon", "flying", "fighting", "ground"];
function friendPicksEvolution(s: GameState): GameState {
  const st = status(s);
  if (!st.ready || st.auto || st.nextStage !== "adult") return s;
  const met = FRIEND_PREFERENCE.find((v) => st.options.some((o) => o.variant === v && o.met));
  if (met) return chooseEvolution(s, met);
  return st.daysInStage > st.minDays + 21 ? chooseEvolution(s, "pure") : s;
}

export function fightFriend(prev: GameState, f: Friend, charge: number) {
  return fightSnapshot(prev, f, snapshotOf(friendState(prev, f)), charge);
}
