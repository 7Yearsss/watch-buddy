import { createRng, type Rng } from "./rng";
import { OFF_TYPE_PENALTY, type Skill } from "./skills";
import type { Combatant, Tactic } from "./species";
import { effectiveness } from "./typechart";

export const BATTLE = {
  maxTurns: 20,
  hpPerStat: 2,
  defenseOffset: 50,
  critChance: 0.1,
  critMultiplier: 1.5,
  speedJitter: 0.1,
  damageJitter: 0.25,
  /** Dodge chance grows when the defender is faster than the attacker. */
  dodge: { base: 0.08, perSpeedRatio: 0.15, min: 0.02, max: 0.2 },
  energyPerAction: 25,
  energyWhenHit: 15,
  ultimateCost: 100,
  maxHeals: 2,
  maxShields: 2,
  shieldHits: 2,
  shieldFactor: 0.5,
  slowFactor: 0.8,
  healPerRecovery: 1.5 / 50,
  /** Passive HP regained at the end of each turn, per point of recovery. Keeps recovery useful without a heal skill. */
  regenPerRecovery: 0.06,
  healAt: { aggressive: 0.25, balanced: 0.4, cautious: 0.55 } satisfies Record<Tactic, number>,
};

export type Side = "a" | "b";

export interface BattleEvent {
  turn: number;
  actor: Side;
  skill: string;
  kind: Skill["kind"];
  damage?: number;
  heal?: number;
  dodged?: boolean;
  effectiveness?: number;
  crit?: boolean;
  /** Remaining HP of a and b after the action. */
  hp: [number, number];
}

export interface BattleResult {
  winner: Side | "draw";
  turns: number;
  /** Remaining HP fraction of a and b. */
  hpLeft: [number, number];
  maxHp: [number, number];
  log: BattleEvent[];
}

interface Fighter {
  c: Combatant;
  maxHp: number;
  hp: number;
  energy: number;
  shieldHits: number;
  heals: number;
  shields: number;
  slowed: boolean;
  /** Exponent on type effectiveness for this battle (1 = full chart). */
  typeScale: number;
}

const fighter = (c: Combatant, typeScale: number): Fighter => {
  const maxHp = Math.round(c.stats.hp * BATTLE.hpPerStat);
  return { c, maxHp, hp: maxHp, energy: 0, shieldHits: 0, heals: 0, shields: 0, slowed: false, typeScale };
};

const speedOf = (f: Fighter) => f.c.stats.speed * (f.slowed ? BATTLE.slowFactor : 1);

function powerAgainst(user: Fighter, target: Fighter, skill: Skill): number {
  const offType = skill.type !== null && !user.c.types.includes(skill.type) ? OFF_TYPE_PENALTY : 1;
  return (
    ((skill.power * user.c.stats.attack) / (target.c.stats.defense + BATTLE.defenseOffset)) *
    Math.pow(effectiveness(skill.type, target.c.types), user.typeScale) *
    offType *
    (user.c.damageBonus ?? 1)
  );
}

function chooseSkill(me: Fighter, foe: Fighter, turn: number): Skill {
  const t = me.c.tactic;
  const find = (kind: Skill["kind"]) => me.c.skills.find((s) => s.kind === kind);

  const ult = find("ultimate");
  if (ult && me.energy >= BATTLE.ultimateCost) return ult;

  const heal = find("heal");
  if (heal && me.heals < BATTLE.maxHeals && me.hp / me.maxHp < BATTLE.healAt[t]) return heal;

  const shield = find("shield");
  if (shield && me.shieldHits === 0 && me.shields < BATTLE.maxShields) {
    if (t === "cautious" || (t === "balanced" && turn === 1)) return shield;
  }

  const slow = find("slow");
  if (slow && t !== "aggressive" && !foe.slowed && speedOf(foe) > speedOf(me)) return slow;

  const attacks = me.c.skills.filter((s) => s.kind === "attack");
  if (attacks.length === 0) return ult ?? me.c.skills[0]!;
  return attacks.reduce((best, s) => (powerAgainst(me, foe, s) > powerAgainst(me, foe, best) ? s : best));
}

function act(me: Fighter, foe: Fighter, skill: Skill, rng: Rng, turn: number, actor: Side): Omit<BattleEvent, "hp"> {
  const event: Omit<BattleEvent, "hp"> = { turn, actor, skill: skill.id, kind: skill.kind };
  me.energy += BATTLE.energyPerAction;

  switch (skill.kind) {
    case "heal": {
      const amount = Math.round(skill.power * me.c.stats.recovery * BATTLE.healPerRecovery);
      const healed = Math.min(amount, me.maxHp - me.hp);
      me.hp += healed;
      me.heals++;
      return { ...event, heal: healed };
    }
    case "shield":
      me.shieldHits = BATTLE.shieldHits;
      me.shields++;
      return event;
    case "slow":
      foe.slowed = true;
      return event;
    case "ultimate":
    case "attack": {
      if (skill.kind === "ultimate") me.energy -= BATTLE.ultimateCost;
      const d = BATTLE.dodge;
      const dodgeChance = Math.min(d.max, Math.max(d.min, d.base + d.perSpeedRatio * (speedOf(foe) / speedOf(me) - 1)));
      if (rng() < dodgeChance) return { ...event, damage: 0, dodged: true, effectiveness: effectiveness(skill.type, foe.c.types) };
      const crit = rng() < BATTLE.critChance;
      let dmg = powerAgainst(me, foe, skill) * (1 - BATTLE.damageJitter + 2 * BATTLE.damageJitter * rng());
      if (crit) dmg *= BATTLE.critMultiplier;
      if (foe.shieldHits > 0) {
        dmg *= BATTLE.shieldFactor;
        foe.shieldHits--;
      }
      const damage = Math.max(1, Math.round(dmg));
      foe.hp = Math.max(0, foe.hp - damage);
      foe.energy += BATTLE.energyWhenHit;
      return { ...event, damage, crit, effectiveness: effectiveness(skill.type, foe.c.types) };
    }
  }
}

/**
 * Fully automatic 1v1 battle. Deterministic for a given seed, so the server can compute it once and every
 * client replays the same log.
 */
export interface BattleOptions {
  /**
   * Softens the type chart: effectiveness^typeScale. Friend battles use a softer chart because two fixed pets meet
   * again and again; at full strength a 1.6× vs 0.625× pairing decides the result before it starts.
   */
  typeScale?: number;
}

export function simulateBattle(a: Combatant, b: Combatant, seed: string, opts: BattleOptions = {}): BattleResult {
  const rng = createRng(seed);
  const fa = fighter(a, opts.typeScale ?? 1);
  const fb = fighter(b, opts.typeScale ?? 1);
  const log: BattleEvent[] = [];
  let turn = 0;

  while (turn < BATTLE.maxTurns && fa.hp > 0 && fb.hp > 0) {
    turn++;
    const jitter = () => 1 - BATTLE.speedJitter + 2 * BATTLE.speedJitter * rng();
    const aFirst = speedOf(fa) * jitter() >= speedOf(fb) * jitter();
    const order: [Fighter, Fighter, Side][] = aFirst
      ? [[fa, fb, "a"], [fb, fa, "b"]]
      : [[fb, fa, "b"], [fa, fb, "a"]];

    for (const [me, foe, side] of order) {
      if (me.hp <= 0 || foe.hp <= 0) break;
      const e = act(me, foe, chooseSkill(me, foe, turn), rng, turn, side);
      log.push({ ...e, hp: [fa.hp, fb.hp] });
    }
    for (const f of [fa, fb])
      if (f.hp > 0) f.hp = Math.min(f.maxHp, f.hp + Math.round(f.c.stats.recovery * BATTLE.regenPerRecovery));
  }

  const hpLeft: [number, number] = [fa.hp / fa.maxHp, fb.hp / fb.maxHp];
  let winner: BattleResult["winner"];
  if (fb.hp <= 0 && fa.hp > 0) winner = "a";
  else if (fa.hp <= 0 && fb.hp > 0) winner = "b";
  else winner = hpLeft[0] > hpLeft[1] ? "a" : hpLeft[1] > hpLeft[0] ? "b" : "draw";

  return { winner, turns: turn, hpLeft, maxHp: [fa.maxHp, fb.maxHp], log };
}
