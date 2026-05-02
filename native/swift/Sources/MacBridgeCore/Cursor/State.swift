import CoreGraphics
import Darwin
import Foundation

enum CursorTargetMode: String, Codable {
    case background
    case display
    case foregroundApp = "foreground-app"
    case foregroundDesktop = "foreground-desktop"
}

struct CursorState: Codable, Equatable {
    var mode: CursorTargetMode
    var wid: Int?
    var displayID: Int? = nil
    var x: Double
    var y: Double
    var coord: String
    var duration: Double
    var visible: Bool
    var updatedAt: Double
}

func executableSessionTag() -> String {
    let url = URL(fileURLWithPath: currentExecutablePath())
    let components = url.pathComponents.suffix(3)
    let joined = components.joined(separator: "-")
    let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._"))
    return joined.unicodeScalars.map { allowed.contains($0) ? String($0) : "_" }.joined()
}

let cursorSessionDirectory = "/tmp/macbridge-cursor-\(executableSessionTag())"
let cursorStatePath = "\(cursorSessionDirectory)/state.json"
let cursorPIDPath = "\(cursorSessionDirectory)/pid"
let cursorReadyPath = "\(cursorSessionDirectory)/ready"
let cursorVisibilityAnimationDuration = 0.12
let cursorClickPressDuration = 0.05
let cursorClickPulseDuration = 0.22

let cursorPulseNotification = Notification.Name("macbridge.cursor-pulse")
let cursorStopNotification = Notification.Name("macbridge.cursor-stop")

func ensureCursorSessionDirectory() throws {
    try FileManager.default.createDirectory(atPath: cursorSessionDirectory, withIntermediateDirectories: true)
}

func atomicWrite(_ data: Data, to path: String) throws {
    let temp = "\(path).tmp.\(UUID().uuidString)"
    try data.write(to: URL(fileURLWithPath: temp))
    _ = try? FileManager.default.removeItem(atPath: path)
    try FileManager.default.moveItem(atPath: temp, toPath: path)
}

func writeCursorState(_ state: CursorState) throws {
    try ensureCursorSessionDirectory()
    let data = try JSONEncoder().encode(state)
    try atomicWrite(data, to: cursorStatePath)
}

func readCursorState() throws -> CursorState {
    let data = try Data(contentsOf: URL(fileURLWithPath: cursorStatePath))
    return try JSONDecoder().decode(CursorState.self, from: data)
}

func writeCursorPID(_ pid: Int32) throws {
    try ensureCursorSessionDirectory()
    try atomicWrite(Data(String(pid).utf8), to: cursorPIDPath)
}

func writeCursorReady() throws {
    try ensureCursorSessionDirectory()
    try atomicWrite(Data("ready".utf8), to: cursorReadyPath)
}

func isCursorReady() -> Bool {
    FileManager.default.fileExists(atPath: cursorReadyPath)
}

func readCursorPID() -> Int32? {
    guard let raw = try? String(contentsOfFile: cursorPIDPath, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines),
          let pid = Int32(raw) else {
        return nil
    }
    return pid
}

func isProcessAlive(_ pid: Int32) -> Bool {
    guard pid > 0 else { return false }
    return kill(pid, 0) == 0
}

func removeCursorSessionFiles() {
    try? FileManager.default.removeItem(atPath: cursorStatePath)
    try? FileManager.default.removeItem(atPath: cursorPIDPath)
    try? FileManager.default.removeItem(atPath: cursorReadyPath)
}

func currentExecutablePath() -> String {
    let path = CommandLine.arguments[0]
    if path.hasPrefix("/") { return path }
    return URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent(path).path
}

func spawnCursorDaemonIfNeeded() throws -> Int32 {
    if let pid = readCursorPID(), isProcessAlive(pid) {
        return pid
    }
    try? FileManager.default.removeItem(atPath: cursorReadyPath)
    let process = Process()
    process.executableURL = URL(fileURLWithPath: currentExecutablePath())
    process.arguments = ["cursor-daemon"]
    let null = FileHandle(forWritingAtPath: "/dev/null")
    process.standardOutput = null
    process.standardError = null
    process.standardInput = nil
    try process.run()
    let pid = process.processIdentifier
    try writeCursorPID(pid)
    for _ in 0..<40 {
        if isCursorReady() { break }
        usleep(25_000)
    }
    return pid
}

func mousePointForCursorState(_ state: CursorState) throws -> (CGPoint, CGWindowID?) {
    guard let coord = CoordMode(rawValue: state.coord) else {
        throw CUAError.cursorStateUnavailable("invalid cursor coord mode: \(state.coord)")
    }
    switch state.mode {
    case .background:
        guard let rawWid = state.wid else {
            throw CUAError.cursorStateUnavailable("background cursor state is missing wid")
        }
        let window = try getWindow(CGWindowID(rawWid))
        let quartzPoint = toGlobal(bounds: window.bounds, x: state.x, y: state.y, coord: coord)
        return (quartzToAppKitPoint(quartzPoint), window.wid)
    case .display:
        guard let displayID = state.displayID else {
            throw CUAError.cursorStateUnavailable("display cursor state is missing displayID")
        }
        let display = try getDisplay(String(displayID))
        let quartzPoint = displayPoint(display: display, x: state.x, y: state.y, coord: coord)
        return (quartzToAppKitPoint(quartzPoint), nil)
    case .foregroundApp:
        let window = try frontmostWindow()
        let quartzPoint = toGlobal(bounds: window.bounds, x: state.x, y: state.y, coord: coord)
        return (quartzToAppKitPoint(quartzPoint), window.wid)
    case .foregroundDesktop:
        let quartzPoint = displayPoint(x: state.x, y: state.y, coord: coord)
        return (quartzToAppKitPoint(quartzPoint), nil)
    }
}

func notifyCursorClickPulse() {
    DistributedNotificationCenter.default().post(name: cursorPulseNotification, object: nil)
}

func notifyCursorStop() {
    DistributedNotificationCenter.default().post(name: cursorStopNotification, object: nil)
}
