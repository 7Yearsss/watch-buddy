/** Friend-battle fairness check (env: USERS, FRIEND_GAP_KEPT, NO_COND, COUNTER): win rate between personas at day 30 and day 90. Run: pnpm --filter @pulseling/sim exec tsx src/friends.ts */
import { defaultConfig as cfg, friendSnapshot, petTypes, runFriendBattle } from "@pulseling/engine";
import { makeUser, PERSONAS, type PersonaId } from "./personas";
import { pickLoadout, simulateUser } from "./run";

const USERS = Number(process.env.USERS ?? 300);
const DAYS = [30, 90];
const seed = "friends";
const outcomes = Array.from({ length: USERS }, (_, i) => simulateUser(makeUser(i, seed), 91, seed, cfg, DAYS));

for (const day of DAYS) {
  const by = new Map<PersonaId, typeof outcomes>();
  for (const o of outcomes) by.set(o.user.persona.id, [...(by.get(o.user.persona.id) ?? []), o]);
  const ids = PERSONAS.map((p) => p.id);
  console.log(`\nDay ${day}: row persona's win rate vs column persona (charge 0.5 both sides)`);
  console.log("".padEnd(10) + ids.map((x) => x.padStart(10)).join(""));
  for (const a of ids) {
    const row: string[] = [];
    for (const b of ids) {
      let wins = 0, n = 0;
      const A = by.get(a) ?? [], B = by.get(b) ?? [];
      for (let k = 0; k < 200 && A.length && B.length; k++) {
        const x = A[k % A.length]!, y = B[(k * 7 + 3) % B.length]!;
        if (x === y) continue;
        const xs = x.snapshots.get(day)!, ys = y.snapshots.get(day)!;
        const snap = friendSnapshot(y.user.id, "d", ys.pet, { recentQualities: process.env.NO_COND ? [] : ys.qualities }, cfg);
        const loadout = process.env.COUNTER ? pickLoadout(xs.pet, xs.learned, petTypes(ys.pet), true).loadout : undefined;
        const r = runFriendBattle(xs.pet, { userId: x.user.id, date: `d${k}`, loadout, gapKept: process.env.FRIEND_GAP_KEPT ? Number(process.env.FRIEND_GAP_KEPT) : undefined, recentQualities: process.env.NO_COND ? [] : xs.qualities, charge: 0.5 }, snap, cfg);
        n++;
        if (r.winner === "a") wins++;
        else if (r.winner === "draw") wins += 0.5;
      }
      row.push(n ? `${Math.round((wins / n) * 100)}%`.padStart(10) : "-".padStart(10));
    }
    console.log(a.padEnd(10) + row.join(""));
  }
}
