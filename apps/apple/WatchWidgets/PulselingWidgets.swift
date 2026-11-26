import PulselingKit
import SwiftUI
import WidgetKit

@main
struct PulselingWidgets: WidgetBundle {
    var body: some Widget {
        PetWidget()
    }
}

struct GlanceEntry: TimelineEntry {
    let date: Date
    let glance: Glance
}

struct GlanceProvider: TimelineProvider {
    func placeholder(in context: Context) -> GlanceEntry { GlanceEntry(date: .now, glance: .placeholder) }

    func getSnapshot(in context: Context, completion: @escaping (GlanceEntry) -> Void) {
        completion(GlanceEntry(date: .now, glance: load()))
    }

    // S2: one entry, refreshed every 30 minutes. Sleep / awake entries by the pet's schedule come in S4.
    func getTimeline(in context: Context, completion: @escaping (Timeline<GlanceEntry>) -> Void) {
        let entry = GlanceEntry(date: .now, glance: load())
        completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(30 * 60))))
    }

    private func load() -> Glance {
        let group = Bundle.main.object(forInfoDictionaryKey: "PulselingAppGroup") as? String ?? ""
        return GlanceStore(appGroup: group).load() ?? .placeholder
    }
}

struct PetWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "pet", provider: GlanceProvider()) { entry in
            PetWidgetView(entry: entry)
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Pulseling")
        .description("你的宠物今天怎么样")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline, .accessoryCorner])
    }
}

struct PetWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: GlanceEntry

    var body: some View {
        switch family {
        case .accessoryRectangular:
            VStack(alignment: .leading) {
                Text("第 \(entry.glance.dayNumber) 天").font(.headline)
                Text(entry.glance.short ?? "Pulseling").font(.caption).lineLimit(2)
            }
        case .accessoryInline:
            Text(entry.glance.short ?? "Pulseling")
        case .accessoryCorner:
            Text("\(entry.glance.dayNumber)").widgetLabel("Pulseling")
        default:
            ZStack {
                AccessoryWidgetBackground()
                Text("\(entry.glance.dayNumber)").font(.title3.monospacedDigit())
            }
        }
    }
}
