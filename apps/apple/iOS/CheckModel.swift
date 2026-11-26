import Foundation
import HealthKit
import Observation
import PulselingKit
import UIKit
import UserNotifications

/// S2's three checks on a real iPhone (docs/design/11, 三、S2): what HealthKit gives us for one day, how late iOS wakes
/// us after new data, and whether an APNs sandbox token comes back. Plus one round trip to the live server.
@MainActor
@Observable
final class CheckModel {
    enum Phase: Equatable { case idle, working, done, failed(String) }

    var health: Phase = .idle
    var dayJSON: String?
    var server: Phase = .idle
    var serverSummary: String?
    var pushToken: String?
    var wakes: [WakeLog.Entry] = WakeLog.load()
    var observing = UserDefaults.standard.bool(forKey: WakeLog.enabledKey)

    private let reader = HealthReader()
    private let service = PulselingService(tokens: KeychainTokenStore())

    static var yesterday: String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Calendar.current.date(byAdding: .day, value: -1, to: .now)!)
    }

    func readYesterday() async {
        health = .working
        do {
            try await reader.requestAccess()
            let day = try await reader.day(Self.yesterday)
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            dayJSON = String(decoding: try encoder.encode(day), as: UTF8.self)
            health = .done
        } catch {
            health = .failed(error.localizedDescription)
        }
    }

    func setObserving(_ on: Bool) {
        observing = on
        UserDefaults.standard.set(on, forKey: WakeLog.enabledKey)
        if on { Self.resumeObservingIfEnabled() }
    }

    nonisolated static func resumeObservingIfEnabled() {
        guard UserDefaults.standard.bool(forKey: WakeLog.enabledKey), HealthReader.isAvailable else { return }
        Task {
            try? await HealthReader().observe { type in WakeLog.append(type.identifier) }
        }
    }

    func refreshWakes() {
        wakes = WakeLog.load()
    }

    func registerPush() async {
        let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        if granted { UIApplication.shared.registerForRemoteNotifications() } else { pushToken = "没有通知权限" }
    }

    func talkToServer() async {
        server = .working
        do {
            try await service.signUpIfNeeded()
            if let pet = try await service.pet() {
                serverSummary = "第 \(pet.dayNumber) 天 · \(pet.short ?? pet.line ?? "")"
                try? GlanceStore(appGroup: AppInfo.appGroup).save(Glance(pet))
            } else {
                serverSummary = "账号已建好，还没有宠物（孵化在 S3 做）"
            }
            server = .done
        } catch {
            server = .failed("\(error)")
        }
    }
}

/// When iOS woke us for new Health data, kept on the phone (last 100) so we can read the delays after a night.
enum WakeLog {
    struct Entry: Codable, Identifiable, Hashable, Sendable {
        var id: Date { at }
        let at: Date
        let type: String
    }

    static let enabledKey = "s2.observe"
    private static let key = "s2.wakes"

    static func load() -> [Entry] {
        guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([Entry].self, from: data)) ?? []
    }

    static func append(_ type: String) {
        let list = ([Entry(at: .now, type: type)] + load()).prefix(100)
        UserDefaults.standard.set(try? JSONEncoder().encode(Array(list)), forKey: key)
    }
}
