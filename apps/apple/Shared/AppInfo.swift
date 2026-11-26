import Foundation

enum AppInfo {
    /// `group.<bundle prefix>.shared`, set per target in project.yml.
    static let appGroup = Bundle.main.object(forInfoDictionaryKey: "PulselingAppGroup") as? String ?? "group.app.pulseling.shared"
}
