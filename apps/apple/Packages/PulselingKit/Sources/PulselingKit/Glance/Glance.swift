import Foundation

/// The little the watch face and widgets need, saved in the App Group so the widget extension can read it without
/// the network (docs/design/11, App Group). The phone writes it after every server reply; the watch after GET /v1/game.
public struct Glance: Codable, Equatable, Sendable {
    public var dayNumber: Int
    /// Watch-sized line in the user's language, from the server.
    public var short: String?
    public var updatedAt: Date

    public init(dayNumber: Int, short: String?, updatedAt: Date = .now) {
        self.dayNumber = dayNumber
        self.short = short
        self.updatedAt = updatedAt
    }

    public init(_ view: PetView, at date: Date = .now) {
        self.init(dayNumber: view.dayNumber, short: view.short ?? view.line, updatedAt: date)
    }

    public static let placeholder = Glance(dayNumber: 1, short: nil, updatedAt: .distantPast)
}

#if os(iOS) || os(watchOS) || os(macOS)
public struct GlanceStore: Sendable {
    public let appGroup: String

    public init(appGroup: String) {
        self.appGroup = appGroup
    }

    private var url: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)?.appendingPathComponent("glance.json")
    }

    public func load() -> Glance? {
        guard let url, let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Glance.self, from: data)
    }

    public func save(_ glance: Glance) throws {
        guard let url else { return }
        try JSONEncoder().encode(glance).write(to: url, options: .atomic)
    }
}
#endif
