// swift-tools-version: 6.0
import PackageDescription

// Shared by the iPhone app, the watch app and the watch widgets (docs/design/11, "工程放哪").
// Builds on Linux too, without HealthKit, so the day rules can be tested anywhere: `swift test`.
let package = Package(
    name: "PulselingKit",
    platforms: [.iOS(.v17), .watchOS(.v10), .macOS(.v14)],
    products: [
        .library(name: "PulselingKit", targets: ["PulselingKit"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-generator", from: "1.6.0"),
        .package(url: "https://github.com/apple/swift-openapi-runtime", from: "1.7.0"),
        .package(url: "https://github.com/apple/swift-openapi-urlsession", from: "1.0.2"),
        .package(url: "https://github.com/apple/swift-http-types", from: "1.0.0"),
    ],
    targets: [
        .target(
            name: "PulselingAPI",
            dependencies: [.product(name: "OpenAPIRuntime", package: "swift-openapi-runtime")],
            plugins: [.plugin(name: "OpenAPIGenerator", package: "swift-openapi-generator")]
        ),
        .target(
            name: "PulselingKit",
            dependencies: [
                "PulselingAPI",
                .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession"),
                .product(name: "HTTPTypes", package: "swift-http-types"),
            ]
        ),
        .testTarget(
            name: "PulselingKitTests",
            dependencies: ["PulselingKit"],
            resources: [.copy("Fixtures")]
        ),
    ]
)
