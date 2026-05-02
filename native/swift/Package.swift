// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "macbridge",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .library(name: "MacBridgeCore", targets: ["MacBridgeCore"]),
        .executable(name: "macbridge", targets: ["macbridge"])
    ],
    targets: [
        .target(name: "MacBridgeCore"),
        .executableTarget(name: "macbridge", dependencies: ["MacBridgeCore"]),
        .testTarget(name: "MacBridgeCoreTests", dependencies: ["MacBridgeCore"])
    ]
)
