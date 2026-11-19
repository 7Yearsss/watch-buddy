import { simulateBattle, type BattleResult } from "./battle";
import type { EngineConfig } from "./config";
import { petCombatant, type Combatant, type Tactic } from "./species";
import type { SkillId } from "./skills";
import type { PetState } from "./types";

/**
 * Friend battles are asynchronous: you fight a snapshot of your friend's pet (stats, loadout, tactic and condition
 * as of their last sync), like auto-battlers' "ghost" opponents. No one needs to be online, and the server can
 * replay it from the seed. Nothing is lost on a loss.
 */
export interface FriendSnapshot {
  friendId: string;
  /** Snapshot date; one snapshot per friend per day. */
  date: string;
  combatant: Combatant;
}

/** Each friend can be challenged once per day. */
export const FRIEND_BATTLES_PER_FRIEND_PER_DAY = 1;
/**
 * Friend battles level both pets toward each other, like Pokémon's "everyone is level 50" rule, but only partly:
 * this share of the power gap is kept, so a healthier, longer-raised pet still has an edge, just not an unbeatable one.
 * Type matchup, loadout, tactic, charge and the condition bonus (recent effort relative to yourself) decide the rest.
 */
export const FRIEND_GAP_KEPT = 0.25;

const total = (c: Combatant) => Object.values(c.stats).reduce((a, b) => a + b, 0);

/** Scale both sides' stats toward their geometric mean, keeping `kept` of the gap in log space. */
export function levelPair(a: Combatant, b: Combatant, kept = FRIEND_GAP_KEPT): [Combatant, Combatant] {
  const ta = total(a), tb = total(b);
  const mid = Math.sqrt(ta * tb);
  const scale = (c: Combatant, t: number): Combatant => {
    const k = (mid * Math.pow(t / mid, kept)) / t;
    return { ...c, stats: Object.fromEntries(Object.entries(c.stats).map(([s, v]) => [s, v * k])) as Combatant["stats"] };
  };
  return [scale(a, ta), scale(b, tb)];
}

/** Friend battles use a softer type chart (1.6× → ~1.18×, 0.625× → ~0.85×) so a fixed pairing isn't decided by type alone. */
export const FRIEND_TYPE_SCALE = 0.35;

/** The charge-up tap adds at most this much damage, so timing is fun but can't beat a much stronger pet. */
export const CHARGE_MAX_BONUS = 0.06;

export function friendSnapshot(friendId: string, date: string, pet: PetState, opts: { loadout?: SkillId[]; tactic?: Tactic; recentQualities?: number[] }, cfg: EngineConfig): FriendSnapshot {
  return { friendId, date, combatant: petCombatant(pet, opts, cfg) };
}

/**
 * `charge` is the 0–1 accuracy of the pre-battle tap on the watch. It only ever adds (never below 0), in line with
 * "only add, never subtract".
 */
export function runFriendBattle(
  pet: PetState,
  opts: { userId: string; date: string; loadout?: SkillId[]; tactic?: Tactic; recentQualities?: number[]; charge?: number; gapKept?: number; typeScale?: number },
  friend: FriendSnapshot,
  cfg: EngineConfig,
): BattleResult {
  const me = petCombatant(pet, opts, cfg);
  const charge = Math.max(0, Math.min(1, opts.charge ?? 0));
  me.damageBonus = (me.damageBonus ?? 1) * (1 + CHARGE_MAX_BONUS * charge);
  const [a, b] = levelPair(me, friend.combatant, opts.gapKept ?? FRIEND_GAP_KEPT);
  return simulateBattle(a, b, `${opts.userId}:${opts.date}:friend:${friend.friendId}`, { typeScale: opts.typeScale ?? FRIEND_TYPE_SCALE });
}
