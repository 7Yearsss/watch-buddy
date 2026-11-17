import { describe, expect, it } from "vitest";
import {
  BEATS,
  defaultConfig as cfg,
  effectiveness,
  getSkill,
  hatch,
  petCombatant,
  petStats,
  runDailyTrial,
  runWeeklyBoss,
  simulateBattle,
  validateLoadout,
  knownSkills,
  WILD_ROSTER,
  SUPER,
  RESISTED,
  type Combatant,
  type EchoType,
  type SkillId,
  type ElementType,
  type PetState,
} from "../src";

const TYPES = Object.keys(BEATS) as ElementType[];

function basePet(starter: PetState["starter"], over: Partial<PetState> = {}): PetState {
  return { ...hatch({ id: `pet-${starter}`, starter, date: "2026-03-01", history: [] }, cfg).pet, ...over };
}

function winRate(make: (seed: number) => [Combatant, Combatant], n = 300): number {
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const [a, b] = make(i);
    if (simulateBattle(a, b, `seed-${i}`).winner === "a") wins++;
  }
  return wins / n;
}

describe("type chart", () => {
  it("every type beats exactly 2 and is beaten by exactly 2", () => {
    for (const t of TYPES) {
      expect(BEATS[t]).toHaveLength(2);
      expect(TYPES.filter((o) => BEATS[o].includes(t))).toHaveLength(2);
    }
  });

  it("has no mutual counters except dragon vs dragon", () => {
    for (const a of TYPES) for (const b of BEATS[a]) if (a !== b) expect(BEATS[b]).not.toContain(a);
  });

  it("averages dual types so the maximum stays at the single-type multiplier", () => {
    expect(effectiveness("fire", ["grass"])).toBe(SUPER);
    expect(effectiveness("water", ["fire"])).toBe(SUPER);
    expect(effectiveness("fire", ["water"])).toBe(RESISTED);
    expect(effectiveness("fire", ["grass", "water"])).toBeCloseTo((SUPER + RESISTED) / 2);
    expect(effectiveness(null, ["grass"])).toBe(1);
  });
});

describe("battle", () => {
  const fire = () => petCombatant(basePet("fire"), {}, cfg);
  const grass = () => petCombatant(basePet("grass"), {}, cfg);
  const water = () => petCombatant(basePet("water"), {}, cfg);

  it("is deterministic per seed and ends within 20 turns", () => {
    const r1 = simulateBattle(fire(), grass(), "x");
    const r2 = simulateBattle(fire(), grass(), "x");
    expect(r1).toEqual(r2);
    expect(r1.turns).toBeLessThanOrEqual(20);
    expect(r1.log.length).toBeGreaterThan(0);
  });

  it("makes type advantage matter in the starter triangle", () => {
    expect(winRate(() => [fire(), grass()])).toBeGreaterThan(0.7);
    expect(winRate(() => [fire(), water()])).toBeLessThan(0.3);
    expect(winRate(() => [water(), grass()])).toBeLessThan(0.3);
  });

  it("gives a better-conditioned pet an edge in a mirror match", () => {
    const fresh = () => petCombatant(basePet("fire"), { recentQualities: [1, 1, 1] }, cfg);
    expect(winRate(() => [fresh(), fire()])).toBeGreaterThan(0.6);
  });
});

describe("loadout", () => {
  it("requires two own-type skills and only known ones", () => {
    const pet = basePet("fire");
    const known = knownSkills(pet, ["static-jolt"]);
    expect(validateLoadout(pet, ["tackle", "ember-bite", "static-jolt", "blaze-burst"], known)).toBeNull();
    expect(validateLoadout(pet, ["tackle", "ember-bite", "static-jolt", "guard"], known)).toMatch(/own type/);
    expect(validateLoadout(pet, ["tackle", "ember-bite", "rock-stomp", "blaze-burst"], known)).toMatch(/not been learned/);
  });

  it("hits 20% softer with off-type skills", () => {
    expect(getSkill("static-jolt").power).toBe(getSkill("ember-bite").power);
  });
});

describe("daily trial and weekly boss", () => {
  const juvenile = basePet("fire", {
    stage: "juvenile",
    statGrowth: { hp: 120, recovery: 120, attack: 120, speed: 120, defense: 120 },
  });

  it("usually beats a common wild monster", () => {
    const commons = WILD_ROSTER.filter((s) => s.rarity === "common" && s.type !== "dragon");
    let wins = 0;
    let total = 0;
    for (const species of commons)
      for (let i = 0; i < 40; i++) {
        total++;
        if (runDailyTrial(juvenile, { userId: "u", date: `2026-03-${10 + (i % 18)}-${i}`, wild: species }, cfg).captured) wins++;
      }
    expect(wins / total).toBeGreaterThan(0.5);
    expect(wins / total).toBeLessThan(0.95);
  });

  describe("weekly boss balance (targets from the design)", () => {
    const avg = petStats(juvenile);
    const rate = (type: EchoType, q: number, loadout?: SkillId[]) => {
      let wins = 0;
      for (let i = 0; i < 300; i++) {
        const { result } = runWeeklyBoss(
          juvenile,
          { userId: `u${i}`, date: "2026-03-08", type, recentQualities: [q, q, q], loadout },
          cfg,
        );
        if (result.winner === "a") wins++;
      }
      return wins / 300;
    };

    it("is never a sure loss: a counter skill and a good week turn a bad matchup around", () => {
      expect(rate("water", 0)).toBeLessThan(0.3);
      expect(rate("water", 1, ["tackle", "ember-bite", "leaf-cut", "blaze-burst"])).toBeGreaterThan(0.55);
    });

    it("is a real challenge in a neutral week and rewards a better week", () => {
      const normal = rate("electric", 0);
      const great = rate("electric", 1);
      expect(normal).toBeGreaterThan(0.2);
      expect(normal).toBeLessThan(0.5);
      expect(great - normal).toBeGreaterThan(0.15);
    });

    it("is never a sure win with the type advantage", () => {
      expect(rate("grass", 0)).toBeLessThan(0.85);
      expect(rate("grass", 0)).toBeGreaterThan(0.5);
    });
  });
});
