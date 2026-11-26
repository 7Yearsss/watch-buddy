import Foundation
import Testing
@testable import PulselingKit

/// The HealthKit → DailyHealth contract (docs/design/11). apps/server/test/contract.test.ts checks the same
/// fixtures' expected rows against the server's schema and the engine.
struct HealthContractTests {
    struct Fixture: Decodable {
        let name: String
        let input: DayInput
        let expected: DailyHealth
    }

    static let fixtures: [Fixture] = {
        let url = Bundle.module.url(forResource: "health-days", withExtension: "json", subdirectory: "Fixtures")!
        return try! JSONDecoder().decode([Fixture].self, from: Data(contentsOf: url))
    }()

    @Test(arguments: fixtures.map(\.name))
    func fixtureDay(name: String) throws {
        let f = try #require(Self.fixtures.first { $0.name == name })
        #expect(DayRules.day(f.input) == f.expected)
    }

    @Test func uploadBodyHasNoDate() throws {
        var day = DailyHealth(date: "2026-11-24", worn: true)
        day.steps = 1200
        let json = try JSONSerialization.jsonObject(with: PulselingService.undated(day)) as! [String: Any]
        #expect(json["date"] == nil)
        #expect(json["steps"] as? Double == 1200)
        #expect(json["worn"] as? Bool == true)
    }

    @Test func overlappingSourcesCountOnce() {
        let spans: [DayInput.SleepSpan] = [
            .init(stage: .core, start: 1400, end: 1500),
            .init(stage: .unspecified, start: 1450, end: 1550),
            .init(stage: .deep, start: 1550, end: 1600),
        ]
        #expect(DayRules.unionLength(spans) == 200)
    }
}
