import SwiftUI
import UIKit

@main
struct PulselingApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var model = CheckModel()

    var body: some Scene {
        WindowGroup {
            CheckView(model: model)
                .onAppear { delegate.onToken = { model.pushToken = $0 } }
        }
    }
}

/// APNs only reports the device token through the app delegate.
@MainActor
final class AppDelegate: NSObject, UIApplicationDelegate {
    var onToken: ((String) -> Void)?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // HealthKit observer queries must be set up again at every launch, including background launches.
        CheckModel.resumeObservingIfEnabled()
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        onToken?(deviceToken.map { String(format: "%02x", $0) }.joined())
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        onToken?("失败：\(error.localizedDescription)")
    }
}
