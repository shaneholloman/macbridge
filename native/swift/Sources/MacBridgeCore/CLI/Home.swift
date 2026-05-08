import ApplicationServices
import CoreGraphics
import Foundation

private let installedAppPath = "/Applications/MacBridge.app"
private let bundleID = "nz.uic.macbridge"

func compactUsage() -> String {
    """
    MacBridge

    Native macOS automation for TypeScript-first agent systems.

    Start:
      macbridge setup       guide first-run permissions
      macbridge doctor      check install, signing, and permissions
      macbridge windows     list visible windows
      macbridge displays    list displays

    Common:
      macbridge permissions check --prompt
      macbridge capture display main --png -o screens/display.png
      macbridge act window <wid|app> click <x> <y>

    Help:
      macbridge help        show this guide
      macbridge help all    show the full command reference
    """
}

func printHome() {
    let permissions = permissionState()
    let appExists = FileManager.default.fileExists(atPath: installedAppPath)
    let service = isServiceRunning()

    print(
        """
        MacBridge

        Status
          Accessibility       \(statusWord(permissions.accessibility))
          Screen Recording    \(statusWord(permissions.screenRecording))
          Service             \(service ? "Running" : "Stopped")
          App                 \(appExists ? installedAppPath : "Not installed")

        Try
          mb setup            guide first-run permissions
          mb doctor           check install and privacy state
          mb windows          list visible windows
          mb displays         list displays

        Help
          mb help             compact guide
          mb help all         full command reference
        """
    )
}

func runSetup() {
    let before = permissionState()

    print("MacBridge Setup")
    print("")
    print("Current permissions")
    print("  Accessibility       \(statusWord(before.accessibility))")
    print("  Screen Recording    \(statusWord(before.screenRecording))")
    print("")

    if before.accessibility && before.screenRecording {
        print("MacBridge has the macOS permissions it needs.")
        print("")
        print("Try:")
        print("  mb windows")
        print("  mb displays")
        print("  mb doctor")
        return
    }

    _ = permissionReport(prompt: true)

    if !before.accessibility {
        openPrivacyPane("Privacy_Accessibility")
    } else if !before.screenRecording {
        openPrivacyPane("Privacy_ScreenCapture")
    }

    let after = permissionState()
    print("Requested missing grants from macOS.")
    print("")
    print("Updated permissions")
    print("  Accessibility       \(statusWord(after.accessibility))")
    print("  Screen Recording    \(statusWord(after.screenRecording))")
    print("")

    if !after.screenRecording {
        print("If Screen Recording does not appear automatically, drag:")
        print("  \(installedAppPath)")
        print("")
        print("into:")
        print("  Privacy & Security > Screen & System Audio Recording")
        print("")
    }

    print("After changing privacy settings, quit and reopen MacBridge.")
}

func runDoctor() {
    let appExists = FileManager.default.fileExists(atPath: installedAppPath)
    let plist = "\(installedAppPath)/Contents/Info.plist"
    let executable = "\(installedAppPath)/Contents/MacOS/macbridge"
    let runtime = "\(installedAppPath)/Contents/MacOS/macbridge-runtime"
    let shim = "/usr/local/bin/macbridge"
    let permissions = permissionState()
    var launchServicesOK = true

    print("MacBridge Doctor")
    print("")
    doctorLine(appExists ? .ok : .warn, "App bundle", appExists ? installedAppPath : "missing")
    doctorLine(FileManager.default.fileExists(atPath: executable) ? .ok : .warn, "Shell binary", executable)
    doctorLine(FileManager.default.fileExists(atPath: runtime) ? .ok : .warn, "Runtime binary", runtime)
    doctorLine(FileManager.default.fileExists(atPath: shim) ? .ok : .warn, "CLI shim", shim)

    if appExists {
        let actualBundleID = plistValue(path: plist, key: "CFBundleIdentifier") ?? "unknown"
        doctorLine(actualBundleID == bundleID ? .ok : .fail, "Bundle ID", actualBundleID)
        doctorLine(commandSucceeds(["/usr/bin/codesign", "--verify", "--deep", "--strict", installedAppPath]) ? .ok : .fail, "Code signing", "codesign verify")
        doctorLine(commandSucceeds(["/usr/sbin/spctl", "--assess", "--type", "execute", installedAppPath]) ? .ok : .warn, "Gatekeeper", "execute assessment")
        let ls = launchServicesMacBridgeSummary()
        launchServicesOK = ls.ok
        doctorLine(ls.ok ? .ok : .warn, "Launch Services", ls.message)
    }

    let serviceRunning = isServiceRunning()
    doctorLine(permissions.accessibility ? .ok : .warn, "Accessibility", statusWord(permissions.accessibility))
    doctorLine(permissions.screenRecording ? .ok : .warn, "Screen Recording", statusWord(permissions.screenRecording))
    doctorLine(serviceRunning ? .ok : .warn, "Service", serviceRunning ? "running" : "stopped")

    print("")
    if permissions.accessibility && permissions.screenRecording && appExists && launchServicesOK {
        if serviceRunning {
            print("MacBridge looks ready.")
        } else {
            print("MacBridge is installed and permissions are accepted.")
            print("Run `mb service start` if you want the long-running daemon.")
        }
    } else {
        print("Next:")
        if !appExists {
            print("  Install MacBridge.app into /Applications.")
        }
        if !permissions.accessibility || !permissions.screenRecording {
            print("  Run: mb setup")
            print("  Or open: MacBridge > About MacBridge > Permissions")
        }
        if !launchServicesOK {
            print("  Run: bun build/cli.ts tcc-reset --keep-installed-apps")
            print("  Then quit and reopen System Settings.")
        }
    }
}

func compactCaptureHelp() -> String {
    """
    capture needs a target.

    Try:
      mb capture display main --png -o screens/display.png
      mb capture app --png -o screens/front-app.png
      mb capture window <wid|app> --png -o screens/window.png
    """
}

func compactActHelp() -> String {
    """
    act needs a target and action.

    Try:
      mb act window <wid|app> click <x> <y>
      mb act app type "hello"
      mb act display main click <x> <y>
    """
}

private enum DoctorStatus {
    case ok
    case warn
    case fail
}

private func doctorLine(_ status: DoctorStatus, _ label: String, _ detail: String) {
    let mark: String
    switch status {
    case .ok: mark = "OK"
    case .warn: mark = "WARN"
    case .fail: mark = "FAIL"
    }
    print("  \(mark.padding(toLength: 5, withPad: " ", startingAt: 0)) \(label.padding(toLength: 18, withPad: " ", startingAt: 0)) \(detail)")
}

private func permissionState() -> (accessibility: Bool, screenRecording: Bool) {
    (
        accessibility: AXIsProcessTrusted(),
        screenRecording: CGPreflightScreenCaptureAccess()
    )
}

private func statusWord(_ granted: Bool) -> String {
    granted ? "Accepted" : "Missing"
}

private func openPrivacyPane(_ anchor: String) {
    _ = runProcess([
        "/usr/bin/open",
        "x-apple.systempreferences:com.apple.preference.security?\(anchor)"
    ])
}

private func plistValue(path: String, key: String) -> String? {
    let result = runProcess(["/usr/libexec/PlistBuddy", "-c", "Print :\(key)", path])
    guard result.status == 0 else { return nil }
    return result.stdout.trimmingCharacters(in: .whitespacesAndNewlines)
}

private func commandSucceeds(_ args: [String]) -> Bool {
    runProcess(args).status == 0
}

private func launchServicesMacBridgeSummary() -> (ok: Bool, message: String) {
    let lsregister = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
    let script = """
    \(lsregister) -dump | /usr/bin/awk 'BEGIN { p = "" } /^[[:space:]]*path:/ { p = $0 } /^[[:space:]]*identifier:[[:space:]]*nz[.]uic[.]macbridge/ { print p; print $0 }'
    """
    let result = runProcess(["/bin/zsh", "-lc", script], timeout: 10)
    guard result.status == 0 else {
        return (false, result.stderr.isEmpty ? "unable to inspect" : result.stderr)
    }

    let lines = result.stdout.split(separator: "\n").map(String.init)
    var macbridgePaths: [String] = []
    var currentPath: String?
    var currentIdentifier: String?

    for line in lines {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        if trimmed.hasPrefix("path:") {
            currentPath = trimmed.replacingOccurrences(of: "path:", with: "")
                .trimmingCharacters(in: .whitespaces)
                .components(separatedBy: " (")
                .first
        } else if trimmed.hasPrefix("identifier:") {
            currentIdentifier = trimmed.replacingOccurrences(of: "identifier:", with: "")
                .trimmingCharacters(in: .whitespaces)
        } else if trimmed == "--------------------------------------------------------------------------------" {
            if currentIdentifier == bundleID, let path = currentPath {
                macbridgePaths.append(path)
            }
            currentPath = nil
            currentIdentifier = nil
        }
    }
    if currentIdentifier == bundleID, let path = currentPath {
        macbridgePaths.append(path)
    }

    let unique = Array(Set(macbridgePaths)).sorted()
    if unique == [installedAppPath] {
        return (true, installedAppPath)
    }
    if unique.isEmpty {
        return (false, "no \(bundleID) app record")
    }
    return (false, "\(unique.count) records: \(unique.joined(separator: ", "))")
}

func runProcess(
    _ args: [String],
    timeout: TimeInterval? = nil
) -> (status: Int32, stdout: String, stderr: String) {
    guard let executable = args.first else {
        return (1, "", "missing executable")
    }

    let process = Process()
    process.executableURL = URL(fileURLWithPath: executable)
    process.arguments = Array(args.dropFirst())

    let stdoutPipe = Pipe()
    let stderrPipe = Pipe()
    process.standardOutput = stdoutPipe
    process.standardError = stderrPipe

    do {
        try process.run()
        if let timeout {
            let deadline = Date().addingTimeInterval(timeout)
            while process.isRunning && Date() < deadline {
                usleep(50_000)
            }
            if process.isRunning {
                process.terminate()
                usleep(100_000)
                if process.isRunning {
                    process.interrupt()
                }
                process.waitUntilExit()
                return (124, "", "timed out")
            }
        } else {
            process.waitUntilExit()
        }
    } catch {
        return (1, "", "\(error)")
    }

    let stdout = String(data: stdoutPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    let stderr = String(data: stderrPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    return (process.terminationStatus, stdout, stderr)
}
