import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createGame, liveDay } from "@pulseling/game";
import { createApp } from "../src/app";
import { DatedHealth } from "../src/schema";
import { memoryStore } from "../src/store";

// The Swift package builds its client from this file (swift-openapi-generator), so it must match the server.
// After changing a route or schema: UPDATE_OPENAPI=1 pnpm test
const KIT = new URL("../../apple/Packages/PulselingKit/", import.meta.url);
const SPEC = new URL("Sources/PulselingAPI/openapi.json", KIT);

describe("contract with the Apple apps", () => {
  it("apps/apple has the current openapi.json", async () => {
    const res = await createApp({ store: memoryStore() }).request("/openapi.json");
    const spec = JSON.stringify(await res.json(), null, 2) + "\n";
    if (process.env.UPDATE_OPENAPI) writeFileSync(SPEC, spec);
    expect(readFileSync(SPEC, "utf8").replace(/\r\n/g, "\n")).toBe(spec);
  });

  // The same fixtures drive the Swift HealthKit tests (Tests/PulselingKitTests/HealthContractTests.swift):
  // raw samples in, one DailyHealth out. Here we check every expected row is what the server and engine accept.
  it("every HealthKit fixture's expected day is valid upload data", () => {
    const fixtures = JSON.parse(readFileSync(new URL("Tests/PulselingKitTests/Fixtures/health-days.json", KIT), "utf8")) as {
      name: string;
      expected: Record<string, unknown>;
    }[];
    expect(fixtures.length).toBeGreaterThan(2);
    for (const f of fixtures) {
      const parsed = DatedHealth.safeParse(f.expected);
      expect(parsed.success, `${f.name}: ${parsed.error?.message}`).toBe(true);
      const { date, ...day } = parsed.data!;
      const s = createGame({ userId: "fixture", starter: "grass", installDate: date, history: [] });
      expect(() => liveDay(s, day), f.name).not.toThrow();
    }
  });
});
