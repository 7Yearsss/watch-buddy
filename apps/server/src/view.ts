import {
  chatsLeft,
  condition,
  currentLoadout,
  dayNumber,
  itemMsg,
  morningCard,
  msg,
  replyLabel,
  speciesMsg,
  status,
  t,
  trialInvite,
  type GameState,
  type Locale,
  type ReplyId,
} from "@pulseling/game";

const REPLY_IDS: ReplyId[] = ["pet", "cheer", "sleep-early", "move", "tired"];

/**
 * The slice of GameState a client shows, with every stored copy key rendered as text in `locale`. Raw health history
 * stays out (it has its own endpoint, GET /v1/data). Call inside rules() so remote copy overrides apply.
 */
export function petView(s: GameState, locale: Locale = "zh") {
  const st = status(s);
  const T = (x: Parameters<typeof t>[0]) => t(x, locale);
  const wish = s.wishes[0]?.date === s.today ? s.wishes[0] : null;
  return {
    today: s.today,
    dayNumber: dayNumber(s),
    locale,
    pet: s.pet as unknown as Record<string, unknown>,
    evolution: st as unknown as Record<string, unknown>,
    condition: condition(s),
    card: morningCard(s, st.progress, st.threshold, locale) as unknown as Record<string, unknown> | null,
    line: s.pendingLine ? T(s.pendingLine) : null,
    short: s.pendingShort ? T(s.pendingShort) : null,
    bossPending: s.bossPending,
    lastBoss: s.boss as unknown as Record<string, unknown> | null,
    lastBossName: s.boss ? T(speciesMsg(s.boss.opponentName)) : null,
    wish: wish ? { date: wish.date, kind: wish.kind, target: wish.target, label: T(msg(`wish.${wish.kind}`)), text: T(wish.text), short: T(wish.short), kept: wish.kept } : null,
    letters: s.letters.map((l) => ({ date: l.date, text: T(l.text), read: l.read })),
    feed: s.feed.slice(0, 30).map((f) => ({ date: f.date, text: T(f.text), kind: f.kind })),
    chat: s.chat.log.filter((l) => l.date === s.today).map((l) => ({ from: l.from, text: T(l.text) })),
    replies: REPLY_IDS.map((id) => ({ id, label: T(replyLabel(id)) })),
    memories: s.memories.map((m) => ({ date: m.date, text: T(m.text) })),
    dex: s.dex as Record<string, unknown>,
    dexNames: Object.fromEntries(Object.keys(s.dex).map((id) => [id, T(speciesMsg(id))])),
    collection: Object.entries(s.collection).map(([id, count]) => ({ id, name: T(itemMsg(id)), count })),
    loadout: currentLoadout(s) as string[],
    tactic: s.tactic as string,
    chatsLeft: chatsLeft(s),
    trial: s.trial,
    invite: trialInvite(s),
  };
}

export type PetView = ReturnType<typeof petView>;
