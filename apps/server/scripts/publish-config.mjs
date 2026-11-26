// Publish a remote config file and make it the active one.
//   pnpm --filter @pulseling/server publish-config config/2026-11-first-snow.json            (local D1, for wrangler dev)
//   pnpm --filter @pulseling/server publish-config config/2026-11-first-snow.json --remote   (production D1)
// The version is the file name plus a hash of its content, so editing a file always makes a new version and old
// versions stay in the table for replays.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error("usage: publish-config <config.json> [--remote]");
  process.exit(1);
}
const text = readFileSync(file, "utf8");
const body = JSON.stringify(JSON.parse(text)); // fails loudly on broken JSON
for (const e of JSON.parse(body).events ?? []) {
  if (!(e.id && e.text && /^\d{4}-\d{2}-\d{2}$/.test(e.start) && /^\d{4}-\d{2}-\d{2}$/.test(e.end) && e.start <= e.end)) {
    console.error("bad event:", e);
    process.exit(1);
  }
}
const version = `${basename(file, ".json")}-${createHash("sha256").update(body).digest("hex").slice(0, 8)}`;
const q = (s) => `'${s.replace(/'/g, "''")}'`;
const sql = `UPDATE configs SET active = 0 WHERE active = 1;
INSERT INTO configs (version, body, active, created_at) VALUES (${q(version)}, ${q(body)}, 1, ${q(new Date().toISOString())})
  ON CONFLICT(version) DO UPDATE SET active = 1;`;
const sqlFile = join(mkdtempSync(join(tmpdir(), "pulseling-config-")), "publish.sql");
writeFileSync(sqlFile, sql);
const where = flags.includes("--remote") ? "--remote" : "--local";
execFileSync("npx", ["wrangler", "d1", "execute", "pulseling", where, "--file", sqlFile], { stdio: "inherit", shell: process.platform === "win32" });
console.log(`\nactive config: ${version} (${where.slice(2)}). Running servers pick it up within a minute.`);
