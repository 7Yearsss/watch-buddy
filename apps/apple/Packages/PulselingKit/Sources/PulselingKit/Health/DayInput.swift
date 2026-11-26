import Foundation

/// What HealthKit gave us for one day, before any of our rules. `HealthReader` fills it on the device; tests fill it
/// from Fixtures/health-days.json. Every time is minutes since 00:00 at the start of `date`, local time, so the
/// rules never touch calendars or time zones (a night runs past 1440).
public struct DayInput: Codable, Equatable, Sendable {
    public var date: String

    // Totals from HKStatisticsQuery: HealthKit merges iPhone and Watch, typed-in samples are already filtered out.
    public var steps: Double?
    public var activeEnergyKcal: Double?
    public var flightsClimbed: Double?
    public var distanceKm: Double?
    /// The Exercise ring (`appleExerciseTime`).
    public var exerciseMinutes: Double?
    /// Hours marked "stood" (`appleStandHour`).
    public var standHours: Double?
    public var restingHr: Double?

    // Samples the rules need one by one.
    public var heartRate: [Reading]
    public var hrv: [Reading]
    public var sleep: [SleepSpan]
    public var workouts: [WorkoutSpan]

    public init(
        date: String, steps: Double? = nil, activeEnergyKcal: Double? = nil, flightsClimbed: Double? = nil, distanceKm: Double? = nil,
        exerciseMinutes: Double? = nil, standHours: Double? = nil, restingHr: Double? = nil,
        heartRate: [Reading] = [], hrv: [Reading] = [], sleep: [SleepSpan] = [], workouts: [WorkoutSpan] = []
    ) {
        self.date = date
        self.steps = steps
        self.activeEnergyKcal = activeEnergyKcal
        self.flightsClimbed = flightsClimbed
        self.distanceKm = distanceKm
        self.exerciseMinutes = exerciseMinutes
        self.standHours = standHours
        self.restingHr = restingHr
        self.heartRate = heartRate
        self.hrv = hrv
        self.sleep = sleep
        self.workouts = workouts
    }

    public struct Reading: Codable, Equatable, Sendable {
        public var minute: Double
        public var value: Double
        public var manual: Bool?
        public init(minute: Double, value: Double, manual: Bool? = nil) {
            self.minute = minute
            self.value = value
            self.manual = manual
        }
    }

    public struct SleepSpan: Codable, Equatable, Sendable {
        public enum Stage: String, Codable, Sendable {
            case inBed, awake, unspecified, core, deep, rem
            var isAsleep: Bool { self != .inBed && self != .awake }
        }
        public var stage: Stage
        public var start: Double
        public var end: Double
        /// `HKMetadataKeyWasUserEntered`: typed into the Health app by hand.
        public var manual: Bool?
        public init(stage: Stage, start: Double, end: Double, manual: Bool? = nil) {
            self.stage = stage
            self.start = start
            self.end = end
            self.manual = manual
        }
    }

    public struct WorkoutSpan: Codable, Equatable, Sendable {
        /// The `HKWorkoutActivityType` case name, e.g. "running", "traditionalStrengthTraining".
        public var activity: String
        public var start: Double
        public var end: Double
        public var manual: Bool?
        public init(activity: String, start: Double, end: Double, manual: Bool? = nil) {
            self.activity = activity
            self.start = start
            self.end = end
            self.manual = manual
        }
    }
}
