import Foundation

/// Turns one day of HealthKit data into the row the server settles (docs/design/11, "HealthKit 读什么").
/// Pure and deterministic: the same `DayInput` always gives the same `DailyHealth`, checked against
/// Fixtures/health-days.json here and in apps/server/test/contract.test.ts.
public enum DayRules {
    /// The night that belongs to a day: 18:00 that evening to 12:00 the next day. Afternoon naps don't count.
    static let night: ClosedRange<Double> = 1080...2160
    /// Daytime for "was the watch worn": 06:00–22:00.
    static let daytime: ClosedRange<Double> = 360...1320
    /// Heart-rate gaps longer than this mean the watch was off.
    static let wornGap: Double = 15
    /// Decision 74: worn ≈ 4 h of daytime heart rate, or ≥ 1,500 steps on any device.
    static let wornMinutes: Double = 240
    static let wornSteps: Double = 1500
    /// High zone readings count for at most this long each.
    static let zoneGap: Double = 5
    /// Decision 10: no birthday permission, so the zone starts at resting + 0.6 × (190 − resting).
    static let fallbackRestingHr: Double = 65

    static let cardio: Set<String> = [
        "running", "cycling", "swimming", "rowing", "elliptical", "stairClimbing", "stairs", "stepTraining", "hiking",
        "crossCountrySkiing", "downhillSkiing", "snowboarding", "skatingSports", "paddleSports", "surfingSports",
        "cardioDance", "socialDance", "jumpRope", "mixedCardio", "kickboxing", "boxing", "swimBikeRun", "handCycling",
        "wheelchairRunPace", "soccer", "basketball", "tennis", "badminton", "squash", "tableTennis", "climbing",
    ]
    static let strength: Set<String> = ["traditionalStrengthTraining", "functionalStrengthTraining", "coreTraining"]
    static let interval: Set<String> = ["highIntensityIntervalTraining"]

    public static func day(_ input: DayInput) -> DailyHealth {
        let heart = input.heartRate.filter { $0.manual != true }.sorted { $0.minute < $1.minute }

        var out = DailyHealth(date: input.date, worn: false)
        out.steps = input.steps.map(round0)
        out.activeEnergyKcal = input.activeEnergyKcal.map(round0)
        out.flightsClimbed = input.flightsClimbed.map(round0)
        out.distanceKm = input.distanceKm.map(round2)
        out.highIntensityMinutes = input.exerciseMinutes.map(round0)
        out.standHours = input.standHours.map(round0)
        out.restingHr = input.restingHr.map(round0)

        // Worn: daytime heart rate with no long gaps, or enough steps from any device.
        let daytimeHeart = heart.filter { daytime.contains($0.minute) }
        let covered = zip(daytimeHeart, daytimeHeart.dropFirst()).reduce(0.0) { sum, pair in
            let gap = pair.1.minute - pair.0.minute
            return gap <= wornGap ? sum + gap : sum
        }
        out.worn = covered >= wornMinutes || (input.steps ?? 0) >= wornSteps

        // High heart-rate zone, over the whole calendar day.
        let dayHeart = heart.filter { $0.minute >= 0 && $0.minute < 1440 }
        if !dayHeart.isEmpty {
            let rest = input.restingHr ?? fallbackRestingHr
            let threshold = rest + 0.6 * (190 - rest)
            let zone = zip(dayHeart, dayHeart.dropFirst()).reduce(0.0) { sum, pair in
                let gap = pair.1.minute - pair.0.minute
                return pair.0.value >= threshold && gap <= zoneGap ? sum + gap : sum
            }
            out.highHrZoneMinutes = round0(zone)
        }

        // Sleep: asleep stages only, overlaps from several sources merged, clipped to the night.
        let asleep = input.sleep.filter { $0.manual != true && $0.stage.isAsleep }
        let total = unionLength(asleep)
        if total > 0, let first = merged(asleep).first, let last = merged(asleep).last {
            out.sleepMinutes = round0(total)
            out.bedtimeMinutes = round0(first.lowerBound - 1440)
            out.deepSleepRatio = round2(unionLength(asleep.filter { $0.stage == .deep }) / total)
            let nightHrv = input.hrv.filter { $0.manual != true && $0.minute >= first.lowerBound && $0.minute <= last.upperBound }
            if !nightHrv.isEmpty {
                out.nightHrvMs = round1(nightHrv.map(\.value).reduce(0, +) / Double(nightHrv.count))
            }
        }

        // Workouts that started today, by kind. Walking is already in the steps.
        var cardioMinutes = 0.0, strengthMinutes = 0.0, intervalMinutes = 0.0
        for w in input.workouts where w.manual != true && w.start >= 0 && w.start < 1440 {
            let minutes = max(0, w.end - w.start)
            if interval.contains(w.activity) { intervalMinutes += minutes }
            else if strength.contains(w.activity) { strengthMinutes += minutes }
            else if cardio.contains(w.activity) { cardioMinutes += minutes }
        }
        out.cardioMinutes = round0(cardioMinutes)
        out.strengthMinutes = round0(strengthMinutes)
        out.intervalMinutes = round0(intervalMinutes)
        return out
    }

    /// Sleep spans clipped to the night and merged where they overlap or touch.
    static func merged(_ spans: [DayInput.SleepSpan]) -> [ClosedRange<Double>] {
        let clipped = spans
            .map { max($0.start, night.lowerBound)...max(min($0.end, night.upperBound), max($0.start, night.lowerBound)) }
            .filter { $0.upperBound > $0.lowerBound }
            .sorted { $0.lowerBound < $1.lowerBound }
        var out: [ClosedRange<Double>] = []
        for r in clipped {
            if let last = out.last, r.lowerBound <= last.upperBound {
                out[out.count - 1] = last.lowerBound...max(last.upperBound, r.upperBound)
            } else {
                out.append(r)
            }
        }
        return out
    }

    static func unionLength(_ spans: [DayInput.SleepSpan]) -> Double {
        merged(spans).reduce(0) { $0 + ($1.upperBound - $1.lowerBound) }
    }

    // Half away from zero, like Math.round for the positive values we send.
    static func round0(_ x: Double) -> Double { x.rounded(.toNearestOrAwayFromZero) }
    static func round1(_ x: Double) -> Double { (x * 10).rounded(.toNearestOrAwayFromZero) / 10 }
    static func round2(_ x: Double) -> Double { (x * 100).rounded(.toNearestOrAwayFromZero) / 100 }
}
