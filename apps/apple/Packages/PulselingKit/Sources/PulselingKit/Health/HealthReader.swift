#if canImport(HealthKit) && (os(iOS) || os(watchOS))
import Foundation
import HealthKit

/// Reads one day from HealthKit into a `DayInput` (read only, never writes). The rules live in `DayRules`, so this
/// file only asks HealthKit questions and converts dates to "minutes since the day's midnight".
public final class HealthReader: @unchecked Sendable { // HKHealthStore is documented as thread-safe.
    public let store = HKHealthStore()
    public let calendar: Calendar

    public init(calendar: Calendar = .current) {
        self.calendar = calendar
    }

    public static var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    /// Everything DayRules uses. Listed on the onboarding screen and in the privacy policy, field by field.
    public static let readTypes: Set<HKObjectType> = [
        HKQuantityType(.stepCount),
        HKQuantityType(.activeEnergyBurned),
        HKQuantityType(.flightsClimbed),
        HKQuantityType(.distanceWalkingRunning),
        HKQuantityType(.appleExerciseTime),
        HKQuantityType(.restingHeartRate),
        HKQuantityType(.heartRate),
        HKQuantityType(.heartRateVariabilitySDNN),
        HKCategoryType(.appleStandHour),
        HKCategoryType(.sleepAnalysis),
        HKObjectType.workoutType(),
    ]

    /// Shows the Health permission sheet once. HealthKit never says what was denied; a denied type just reads empty.
    public func requestAccess() async throws {
        try await store.requestAuthorization(toShare: [], read: Self.readTypes)
    }

    /// `date` is "YYYY-MM-DD" in this calendar's time zone.
    public func dayInput(for date: String) async throws -> DayInput {
        guard let midnight = Self.midnight(of: date, calendar: calendar),
              let dayEnd = calendar.date(byAdding: .day, value: 1, to: midnight),
              let nightEnd = calendar.date(byAdding: .hour, value: 12, to: dayEnd),
              let nightStart = calendar.date(byAdding: .hour, value: 18, to: midnight)
        else { throw HealthReaderError.badDate(date) }

        let minute = { (d: Date) in d.timeIntervalSince(midnight) / 60 }
        let manual = { (s: HKSample) in (s.metadata?[HKMetadataKeyWasUserEntered] as? Bool) == true }
        let day = HKQuery.predicateForSamples(withStart: midnight, end: dayEnd, options: .strictStartDate)
        let night = HKQuery.predicateForSamples(withStart: nightStart, end: nightEnd)

        var input = DayInput(date: date)
        input.steps = try await sum(.stepCount, .count(), day)
        input.activeEnergyKcal = try await sum(.activeEnergyBurned, .kilocalorie(), day)
        input.flightsClimbed = try await sum(.flightsClimbed, .count(), day)
        input.distanceKm = try await sum(.distanceWalkingRunning, .meterUnit(with: .kilo), day)
        input.exerciseMinutes = try await sum(.appleExerciseTime, .minute(), day)
        input.restingHr = try await average(.restingHeartRate, .count().unitDivided(by: .minute()), day)

        let stand = try await categorySamples(.appleStandHour, day)
        let stood = stand.filter { $0.value == HKCategoryValueAppleStandHour.stood.rawValue }.count
        input.standHours = stand.isEmpty ? nil : Double(stood)

        input.heartRate = try await quantitySamples(.heartRate, day).map {
            .init(minute: minute($0.startDate), value: $0.quantity.doubleValue(for: .count().unitDivided(by: .minute())), manual: manual($0))
        }
        input.hrv = try await quantitySamples(.heartRateVariabilitySDNN, night).map {
            .init(minute: minute($0.startDate), value: $0.quantity.doubleValue(for: .secondUnit(with: .milli)), manual: manual($0))
        }
        input.sleep = try await categorySamples(.sleepAnalysis, night).compactMap { s in
            Self.stage(s.value).map { .init(stage: $0, start: minute(s.startDate), end: minute(s.endDate), manual: manual(s)) }
        }
        input.workouts = try await workouts(day).map {
            .init(activity: Self.activityName($0.workoutActivityType), start: minute($0.startDate), end: minute($0.endDate), manual: manual($0))
        }
        return input
    }

    /// One finished row, ready for POST /v1/days.
    public func day(_ date: String) async throws -> DailyHealth {
        DayRules.day(try await dayInput(for: date))
    }

    // MARK: Background delivery (S2 check: how late does iOS wake us after a night or a workout?)

    /// Registers wake-ups for new sleep, workouts and steps. `onWake` runs on a HealthKit queue each time.
    public func observe(onWake: @escaping @Sendable (HKSampleType) -> Void) async throws {
        let types: [HKSampleType] = [HKCategoryType(.sleepAnalysis), HKObjectType.workoutType(), HKQuantityType(.stepCount)]
        for type in types {
            try await store.enableBackgroundDelivery(for: type, frequency: type == HKQuantityType(.stepCount) ? .hourly : .immediate)
            let query = HKObserverQuery(sampleType: type, predicate: nil) { _, completion, error in
                if error == nil { onWake(type) }
                completion()
            }
            store.execute(query)
        }
    }

    // MARK: Queries

    private func notTyped(_ p: NSPredicate) -> NSPredicate {
        NSCompoundPredicate(andPredicateWithSubpredicates: [
            p, NSPredicate(format: "metadata.%K != YES", HKMetadataKeyWasUserEntered),
        ])
    }

    private func sum(_ id: HKQuantityTypeIdentifier, _ unit: HKUnit, _ p: NSPredicate) async throws -> Double? {
        let q = HKStatisticsQueryDescriptor(predicate: .quantitySample(type: HKQuantityType(id), predicate: notTyped(p)), options: .cumulativeSum)
        return try await q.result(for: store)?.sumQuantity()?.doubleValue(for: unit)
    }

    private func average(_ id: HKQuantityTypeIdentifier, _ unit: HKUnit, _ p: NSPredicate) async throws -> Double? {
        let q = HKStatisticsQueryDescriptor(predicate: .quantitySample(type: HKQuantityType(id), predicate: notTyped(p)), options: .discreteAverage)
        return try await q.result(for: store)?.averageQuantity()?.doubleValue(for: unit)
    }

    private func quantitySamples(_ id: HKQuantityTypeIdentifier, _ p: NSPredicate) async throws -> [HKQuantitySample] {
        let q = HKSampleQueryDescriptor(predicates: [.quantitySample(type: HKQuantityType(id), predicate: p)], sortDescriptors: [SortDescriptor(\.startDate)])
        return try await q.result(for: store)
    }

    private func categorySamples(_ id: HKCategoryTypeIdentifier, _ p: NSPredicate) async throws -> [HKCategorySample] {
        let q = HKSampleQueryDescriptor(predicates: [.categorySample(type: HKCategoryType(id), predicate: p)], sortDescriptors: [SortDescriptor(\.startDate)])
        return try await q.result(for: store)
    }

    private func workouts(_ p: NSPredicate) async throws -> [HKWorkout] {
        let q = HKSampleQueryDescriptor(predicates: [.workout(p)], sortDescriptors: [SortDescriptor(\.startDate)])
        return try await q.result(for: store)
    }

    // MARK: Mapping

    static func midnight(of date: String, calendar: Calendar) -> Date? {
        let parts = date.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    static func stage(_ value: Int) -> DayInput.SleepSpan.Stage? {
        switch HKCategoryValueSleepAnalysis(rawValue: value) {
        case .inBed: .inBed
        case .awake: .awake
        case .asleepUnspecified: .unspecified
        case .asleepCore: .core
        case .asleepDeep: .deep
        case .asleepREM: .rem
        default: nil
        }
    }

    /// The case names DayRules sorts into cardio / strength / interval.
    static func activityName(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .running: "running"
        case .cycling: "cycling"
        case .swimming: "swimming"
        case .rowing: "rowing"
        case .elliptical: "elliptical"
        case .stairClimbing: "stairClimbing"
        case .stairs: "stairs"
        case .stepTraining: "stepTraining"
        case .hiking: "hiking"
        case .crossCountrySkiing: "crossCountrySkiing"
        case .downhillSkiing: "downhillSkiing"
        case .snowboarding: "snowboarding"
        case .skatingSports: "skatingSports"
        case .paddleSports: "paddleSports"
        case .surfingSports: "surfingSports"
        case .cardioDance: "cardioDance"
        case .socialDance: "socialDance"
        case .jumpRope: "jumpRope"
        case .mixedCardio: "mixedCardio"
        case .kickboxing: "kickboxing"
        case .boxing: "boxing"
        case .swimBikeRun: "swimBikeRun"
        case .handCycling: "handCycling"
        case .wheelchairRunPace: "wheelchairRunPace"
        case .soccer: "soccer"
        case .basketball: "basketball"
        case .tennis: "tennis"
        case .badminton: "badminton"
        case .squash: "squash"
        case .tableTennis: "tableTennis"
        case .climbing: "climbing"
        case .traditionalStrengthTraining: "traditionalStrengthTraining"
        case .functionalStrengthTraining: "functionalStrengthTraining"
        case .coreTraining: "coreTraining"
        case .highIntensityIntervalTraining: "highIntensityIntervalTraining"
        case .walking: "walking"
        default: "other-\(type.rawValue)"
        }
    }
}

public enum HealthReaderError: Error {
    case badDate(String)
}
#endif
