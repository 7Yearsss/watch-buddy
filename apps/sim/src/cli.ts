import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultConfig, RARITIES, WILD_ROSTER } from "@pulseling/engine";
import { makeUser, PERSONAS, type PersonaId } from "./personas";
import { simulateUser, type Outcome } from "./run";

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

const users = arg("users", 1000);
const days = arg("days", 120);
const seed = process.argv.includes("--seed") ? process.argv[process.argv.indexOf("--seed") + 1]! : "sim1";

const pct = (xs: number[], p: number) => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
};
const share = (n: number, d: number) => (d === 0 ? "—" : `${Math.round((100 * n) / d)}%`);
const fmt = (x: number) => (Number.isNaN(x) ? "—" : String(Math.round(x * 10) / 10));

const started = Date.now();
const outcomes: Outcome[] = [];
for (let i = 0; i < users; i++) {
  outcomes.push(simulateUser(makeUser(i, seed), days, seed, defaultConfig));
  if ((i + 1) % 100 === 0) process.stderr.write(`  ${i + 1}/${users}\r`);
}
process.stderr.write("\n");

const lines: string[] = [];
const w = (s = "") => lines.push(s);
const dexAt = (o: Outcome, day: number) => [...o.captures.values()].filter((d) => d < day).length;

w(`# Simulation report`);
w();
w(`${users} users × ${days} days, seed \`${seed}\`, ${((Date.now() - started) / 1000).toFixed(1)}s.`);
w();

w(`## Evolution`);
w();
w(`| Persona | Users | 1st evo median (p10–p90) | Reached adult | 2nd evo median | Hit target | Avg daily growth |`);
w(`|---|---|---|---|---|---|---|`);
for (const p of [...PERSONAS.map((x) => x.id), "all"] as (PersonaId | "all")[]) {
  const os = outcomes.filter((o) => p === "all" || o.user.persona.id === p);
  const juv = os.map((o) => o.juvenileDay).filter((d): d is number => d !== null);
  const adult = os.map((o) => o.adultDay).filter((d): d is number => d !== null);
  const withTarget = os.filter((o) => o.hitTarget !== null);
  w(
    `| ${p} | ${os.length} | ${fmt(pct(juv, 50))} (${fmt(pct(juv, 10))}–${fmt(pct(juv, 90))}) | ${share(adult.length, os.length)} | ${fmt(pct(adult, 50))} | ${share(withTarget.filter((o) => o.hitTarget).length, withTarget.length)} | ${fmt(os.reduce((s, o) => s + o.avgDailyGain, 0) / Math.max(1, os.length))} |`,
  );
}
w();
const variants = new Map<string, number>();
for (const o of outcomes) if (o.adultVariant) variants.set(o.adultVariant, (variants.get(o.adultVariant) ?? 0) + 1);
w(`Adult forms: ${[...variants.entries()].map(([k, v]) => `${k} ${share(v, outcomes.filter((o) => o.adultVariant).length)}`).join(", ")}`);
w();

w(`## Rarity`);
w();
w(`| Rarity | At hatch | At end |`);
w(`|---|---|---|`);
for (const r of RARITIES)
  w(`| ${r} | ${share(outcomes.filter((o) => o.hatchRarity === r).length, users)} | ${share(outcomes.filter((o) => o.finalRarity === r).length, users)} |`);
w();
w(`Common at hatch that ended above common: ${share(outcomes.filter((o) => o.hatchRarity === "common" && o.finalRarity !== "common").length, outcomes.filter((o) => o.hatchRarity === "common").length)}`);
w();

w(`## Collection (${WILD_ROSTER.length} species)`);
w();
w(`| Persona | Encounters / week | Distinct by day 30 (median, p10–p90) | by day 90 | by end |`);
w(`|---|---|---|---|---|`);
for (const p of [...PERSONAS.map((x) => x.id), "all"] as (PersonaId | "all")[]) {
  const os = outcomes.filter((o) => p === "all" || o.user.persona.id === p);
  const d30 = os.map((o) => dexAt(o, 30));
  const d90 = os.map((o) => dexAt(o, 90));
  const end = os.map((o) => o.captures.size);
  w(
    `| ${p} | ${fmt((os.reduce((s, o) => s + o.encounters, 0) / Math.max(1, os.length) / days) * 7)} | ${fmt(pct(d30, 50))} (${fmt(pct(d30, 10))}–${fmt(pct(d30, 90))}) | ${fmt(pct(d90, 50))} | ${fmt(pct(end, 50))} (max ${Math.max(...end)}) |`,
  );
}
w();
const complete = outcomes.filter((o) => o.captures.size === WILD_ROSTER.length).length;
w(`Completed the dex: ${share(complete, users)}`);
w();
w(`Wild capture rate: ${(["common", "rare", "epic"] as const)
  .map((r) => {
    const all = outcomes.flatMap((o) => o.wild.filter((x) => x.rarity === r));
    return `${r} ${share(all.filter((x) => x.won).length, all.length)}`;
  })
  .join(", ")}`);
w();

w(`## Weekly boss`);
w();
w(`| Matchup | Fights | Win rate | Win rate with counter skill |`);
w(`|---|---|---|---|`);
for (const m of ["bossAdvantage", "neutral", "petAdvantage"] as const) {
  const fights = outcomes.flatMap((o) => o.bosses.filter((b) => b.matchup === m));
  const countered = fights.filter((b) => b.countered);
  w(`| ${m} | ${fights.length} | ${share(fights.filter((b) => b.won).length, fights.length)} | ${share(countered.filter((b) => b.won).length, countered.length)} |`);
}
const allBosses = outcomes.flatMap((o) => o.bosses);
w(`| all | ${allBosses.length} | ${share(allBosses.filter((b) => b.won).length, allBosses.length)} | |`);
w();

const report = lines.join("\n");
console.log(report);
const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `report-${seed}-${users}x${days}.md`), report);
