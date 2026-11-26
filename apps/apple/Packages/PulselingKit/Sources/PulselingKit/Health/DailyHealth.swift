import Foundation

/// One day as the server wants it. Mirrors `DailyHealth` in packages/engine/src/types.ts and `DatedHealth` in
/// apps/server/src/schema.ts field for field; a field the phone could not read stays nil and is left out of the JSON.
///
/// Which hours belong to `date`: the activity of that calendar day, and the night that follows it (from 18:00 that
/// evening to noon the next day). That is everything known when the phone uploads the row the next morning.
public struct DailyHealth: Codable, Equatable, Sendable {
    public var date: String
    public var worn: Bool
    public var steps: Double?
    public var standHours: Double?
    public var activeEnergyKcal: Double?
    public var flightsClimbed: Double?
    public var sleepMinutes: Double?
    /// First sleep relative to the midnight that ends `date`: 23:20 → -40, 01:00 → 60.
    public var bedtimeMinutes: Double?
    public var deepSleepRatio: Double?
    public var nightHrvMs: Double?
    public var restingHr: Double?
    public var highHrZoneMinutes: Double?
    public var intervalMinutes: Double?
    public var strengthMinutes: Double?
    public var highIntensityMinutes: Double?
    public var cardioMinutes: Double?
    public var distanceKm: Double?

    public init(date: String, worn: Bool) {
        self.date = date
        self.worn = worn
    }
}
