import Foundation

public func run(_ arguments: [String]) throws {
    var cursor = ArgumentCursor(args: Array(arguments.dropFirst()))
    guard !cursor.args.isEmpty else {
        printHome()
        return
    }
    let command = try cursor.pop()

    switch command {
    case "cursor-daemon":
        try runCursorDaemon()
    case "service":
        try runServiceSubcommand(cursor: &cursor)
    case "help":
        if cursor.args.first == "all" {
            _ = try cursor.pop()
            print(usage())
        } else {
            print(compactUsage())
        }
    case "--help", "-h":
        print(compactUsage())
    case "--help-full":
        print(usage())
    case "doctor":
        runDoctor()
    case "setup":
        runSetup()
    case "active-window":
        try printJSON(listWindows(filter: AppFilter(pid: try frontmostApp().processIdentifier)).first ?? frontmostWindow().jsonObject)
    case "cursor":
        try runCursorCommand(cursor: &cursor)
    case "permissions":
        try runPermissionsSubcommand(cursor: &cursor)
    case "windows":
        try runWindowsSubcommand(cursor: &cursor)
    case "displays":
        try runDisplaysSubcommand(cursor: &cursor)
    case "capture":
        try runCaptureSubcommand(cursor: &cursor)
    case "act":
        try runActSubcommand(cursor: &cursor)
    case "background":
        try runBackgroundSubcommand(cursor: &cursor)
    case "foreground-app":
        try runForegroundAppSubcommand(cursor: &cursor)
    case "foreground-desktop":
        try runForegroundDesktopSubcommand(cursor: &cursor)
    case "foreground-display":
        try runForegroundDisplaySubcommand(cursor: &cursor)
    case "list-apps":
        var runningOnly = false
        while !cursor.args.isEmpty {
            let arg = try cursor.pop()
            switch arg {
            case "--running-only":
                runningOnly = true
            default:
                throw CUAError.usage("unknown list-apps option: \(arg)")
            }
        }
        try printJSON(listApps(runningOnly: runningOnly))
    case "list-windows":
        try printJSON(listWindows(filter: try parseWindowFilter(cursor: &cursor)))
    case "list-displays":
        try printJSON(listDisplays().map(\.jsonObject))
    case "screenshot",
         "activate",
         "click", "right-click", "double-click", "drag", "scroll", "type", "paste", "press", "hotkey":
        cursor.args.insert(command, at: 0)
        try runBackgroundSubcommand(cursor: &cursor)
    default:
        throw CUAError.usage("unknown command: \(command)\n\(usage())")
    }
}

public func runCLI(_ arguments: [String]) -> Int32 {
    do {
        try run(arguments)
        return 0
    } catch let error as CUAError {
        fputs("error: \(error.description)\n", stderr)
        return 1
    } catch {
        fputs("error: \(error)\n", stderr)
        return 1
    }
}
