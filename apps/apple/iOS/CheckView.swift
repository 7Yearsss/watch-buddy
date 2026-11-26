import PulselingKit
import SwiftUI

/// S2 only: a plain list for checking the plumbing on a real iPhone. The real screens follow the web prototype in S3.
struct CheckView: View {
    @Bindable var model: CheckModel
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button("读取昨天（\(CheckModel.yesterday)）") { Task { await model.readYesterday() } }
                        .disabled(model.health == .working)
                    status(model.health)
                    if let json = model.dayJSON {
                        Text(json)
                            .font(.system(.footnote, design: .monospaced))
                            .textSelection(.enabled)
                            .transition(.opacity)
                    }
                } header: {
                    Text("健康数据")
                } footer: {
                    Text("和网页原型的一行 DailyHealth 对照，字段一致即通过。")
                }

                Section("后台唤醒") {
                    Toggle("记录后台唤醒", isOn: Binding(get: { model.observing }, set: { model.setObserving($0) }))
                    if model.wakes.isEmpty {
                        Text("还没有记录。开着它睡一晚或运动一次，明早再看。").foregroundStyle(.secondary)
                    }
                    ForEach(model.wakes.prefix(20)) { wake in
                        LabeledContent(Self.shortType(wake.type)) {
                            Text(wake.at, format: .dateTime.month().day().hour().minute())
                        }
                    }
                }

                Section("推送（APNs 沙盒）") {
                    Button("申请通知权限并注册") { Task { await model.registerPush() } }
                    if let token = model.pushToken {
                        Text(token).font(.system(.footnote, design: .monospaced)).textSelection(.enabled)
                    }
                }

                Section("服务器") {
                    Button("注册并读取宠物") { Task { await model.talkToServer() } }
                        .disabled(model.server == .working)
                    status(model.server)
                    if let s = model.serverSummary { Text(s) }
                }
            }
            .animation(.smooth(duration: 0.25), value: model.dayJSON)
            .navigationTitle("S2 检查")
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { model.refreshWakes() }
        }
    }

    static func shortType(_ id: String) -> String {
        id.replacingOccurrences(of: "HKQuantityTypeIdentifier", with: "")
            .replacingOccurrences(of: "HKCategoryTypeIdentifier", with: "")
            .replacingOccurrences(of: "HKWorkoutTypeIdentifier", with: "Workout")
    }

    @ViewBuilder
    private func status(_ phase: CheckModel.Phase) -> some View {
        switch phase {
        case .idle: EmptyView()
        case .working: ProgressView()
        case .done: Label("完成", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
        case .failed(let message): Label(message, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange)
        }
    }
}
