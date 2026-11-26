import PulselingKit
import SwiftUI

@main
struct PulselingWatchApp: App {
    var body: some Scene {
        WindowGroup {
            WatchHome()
        }
    }
}

/// S2 shell: shows the last glance the phone saved. The three pages, the pet and the morning card come in S4.
struct WatchHome: View {
    @State private var glance = GlanceStore(appGroup: AppInfo.appGroup).load()

    var body: some View {
        VStack(spacing: 6) {
            Text("Pulseling").font(.headline)
            if let glance {
                Text("第 \(glance.dayNumber) 天").font(.title3.monospacedDigit())
                if let short = glance.short {
                    Text(short).font(.footnote).multilineTextAlignment(.center)
                }
            } else {
                Text("在 iPhone 上打开 Pulseling").font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
        }
        .padding()
    }
}
