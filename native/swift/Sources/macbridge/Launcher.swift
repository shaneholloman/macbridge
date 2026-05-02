import AppKit
import ApplicationServices
import CoreGraphics
import Darwin
import Foundation

func shouldOpenAppLauncher(arguments: [String]) -> Bool {
    arguments.count == 1
        && isatty(STDOUT_FILENO) == 0
        && arguments[0].contains(".app/Contents/MacOS/")
}

func runAppLauncher() -> Int32 {
    let app = NSApplication.shared
    app.setActivationPolicy(.regular)

    let delegate = LauncherDelegate()
    app.delegate = delegate
    app.activate(ignoringOtherApps: true)
    app.run()
    return 0
}

private final class LauncherDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow?
    private var permissionTimer: Timer?
    private var lastAccessibility: Bool?
    private var lastScreenRecording: Bool?
    private let accessibilityValue = NSButton(title: "", target: nil, action: nil)
    private let screenRecordingValue = NSButton(title: "", target: nil, action: nil)
    private let noteValue = NSTextField(labelWithString: "")
    private let labelColumnWidth: CGFloat = 148

    func applicationDidFinishLaunching(_ notification: Notification) {
        void(notification)
        buildWindow()
        refreshPermissions(updateNote: true)
        startPermissionPolling()
    }

    func applicationWillTerminate(_ notification: Notification) {
        void(notification)
        permissionTimer?.invalidate()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        void(sender)
        return true
    }

    @objc private func checkPermissions() {
        requestNextMissingPermission()
    }

    @objc private func openCLI() {
        do {
            let script = try writeLaunchCommand()
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
            process.arguments = ["-a", "Terminal", script.path]
            try process.run()
        } catch {
            noteValue.stringValue = "Could not open Terminal: \(error.localizedDescription)"
        }
    }

    private func buildWindow() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 560, height: 320),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "MacBridge"
        window.center()

        let content = NSView(frame: window.contentView?.bounds ?? .zero)
        content.translatesAutoresizingMaskIntoConstraints = false
        window.contentView = content

        let icon = NSImageView()
        icon.translatesAutoresizingMaskIntoConstraints = false
        icon.image = launcherBrandImage()
        icon.imageScaling = .scaleProportionallyUpOrDown

        let title = NSTextField(labelWithString: "MacBridge")
        title.translatesAutoresizingMaskIntoConstraints = false
        title.font = .systemFont(ofSize: 25, weight: .semibold)

        let subtitle = NSTextField(
            labelWithString: "Native macOS automation adapter for TypeScript-first agent systems."
        )
        subtitle.translatesAutoresizingMaskIntoConstraints = false
        subtitle.font = .systemFont(ofSize: 13)
        subtitle.textColor = .secondaryLabelColor
        subtitle.lineBreakMode = .byWordWrapping
        subtitle.maximumNumberOfLines = 2

        let accessibilityLabel = NSTextField(labelWithString: "Accessibility")
        let screenRecordingLabel = NSTextField(labelWithString: "Screen Recording")
        for label in [accessibilityLabel, screenRecordingLabel] {
            label.translatesAutoresizingMaskIntoConstraints = false
            label.font = .systemFont(ofSize: 13, weight: .medium)
        }
        for value in [accessibilityValue, screenRecordingValue] {
            configureStatusButton(value)
        }

        let checkButton = NSButton(
            title: "Check Permissions",
            target: self,
            action: #selector(checkPermissions)
        )
        checkButton.translatesAutoresizingMaskIntoConstraints = false
        checkButton.bezelStyle = .rounded
        checkButton.keyEquivalent = "\r"

        let cliButton = NSButton(
            title: "Open CLI in Terminal",
            target: self,
            action: #selector(openCLI)
        )
        cliButton.translatesAutoresizingMaskIntoConstraints = false
        cliButton.bezelStyle = .rounded

        noteValue.translatesAutoresizingMaskIntoConstraints = false
        noteValue.font = .systemFont(ofSize: 12)
        noteValue.textColor = .secondaryLabelColor
        noteValue.lineBreakMode = .byWordWrapping
        noteValue.maximumNumberOfLines = 3

        for view in [
            icon,
            title,
            subtitle,
            accessibilityLabel,
            accessibilityValue,
            screenRecordingLabel,
            screenRecordingValue,
            checkButton,
            cliButton,
            noteValue,
        ] {
            content.addSubview(view)
        }

        NSLayoutConstraint.activate([
            icon.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 28),
            icon.topAnchor.constraint(equalTo: content.topAnchor, constant: 28),
            icon.widthAnchor.constraint(equalToConstant: 64),
            icon.heightAnchor.constraint(equalToConstant: 64),

            title.leadingAnchor.constraint(equalTo: icon.trailingAnchor, constant: 18),
            title.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -28),
            title.topAnchor.constraint(equalTo: icon.topAnchor, constant: 4),

            subtitle.leadingAnchor.constraint(equalTo: title.leadingAnchor),
            subtitle.trailingAnchor.constraint(equalTo: title.trailingAnchor),
            subtitle.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 6),

            accessibilityLabel.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 28),
            accessibilityLabel.topAnchor.constraint(equalTo: icon.bottomAnchor, constant: 34),
            accessibilityLabel.widthAnchor.constraint(equalToConstant: labelColumnWidth),
            accessibilityValue.leadingAnchor.constraint(equalTo: accessibilityLabel.trailingAnchor, constant: 20),
            accessibilityValue.centerYAnchor.constraint(equalTo: accessibilityLabel.centerYAnchor),

            screenRecordingLabel.leadingAnchor.constraint(equalTo: accessibilityLabel.leadingAnchor),
            screenRecordingLabel.topAnchor.constraint(equalTo: accessibilityLabel.bottomAnchor, constant: 20),
            screenRecordingLabel.widthAnchor.constraint(equalToConstant: labelColumnWidth),
            screenRecordingValue.leadingAnchor.constraint(equalTo: accessibilityValue.leadingAnchor),
            screenRecordingValue.centerYAnchor.constraint(equalTo: screenRecordingLabel.centerYAnchor),

            checkButton.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 28),
            checkButton.topAnchor.constraint(equalTo: screenRecordingLabel.bottomAnchor, constant: 32),

            cliButton.leadingAnchor.constraint(equalTo: checkButton.trailingAnchor, constant: 14),
            cliButton.centerYAnchor.constraint(equalTo: checkButton.centerYAnchor),

            noteValue.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 28),
            noteValue.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -28),
            noteValue.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -24),
        ])

        self.window = window
        window.makeKeyAndOrderFront(nil)
    }

    private func startPermissionPolling() {
        permissionTimer?.invalidate()
        permissionTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.refreshPermissions(updateNote: false)
        }
    }

    private func requestNextMissingPermission() {
        let state = currentPermissions()

        if !state.accessibility {
            AXIsProcessTrustedWithOptions(
                [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
            )
            openPrivacyPane("Privacy_Accessibility")
            noteValue.stringValue =
                "Enable Accessibility for MacBridge, then return here for the next permission."
        } else if !state.screenRecording {
            CGRequestScreenCaptureAccess()
            openPrivacyPane("Privacy_ScreenCapture")
            noteValue.stringValue =
                "Enable Screen Recording for MacBridge, then quit and reopen it before testing captures."
        } else {
            noteValue.stringValue = "MacBridge has the macOS permissions it needs."
        }

        refreshPermissions(updateNote: false)
    }

    private func refreshPermissions(updateNote: Bool) {
        let state = currentPermissions()
        let accessibility = state.accessibility
        let screenRecording = state.screenRecording

        updateStatusBadge(accessibilityValue, accepted: accessibility)
        updateStatusBadge(screenRecordingValue, accepted: screenRecording)

        let changed = lastAccessibility != nil
            && (lastAccessibility != accessibility || lastScreenRecording != screenRecording)
        lastAccessibility = accessibility
        lastScreenRecording = screenRecording

        if updateNote || changed {
            if accessibility && screenRecording {
                noteValue.stringValue = "MacBridge has the macOS permissions it needs."
            } else if updateNote {
                noteValue.stringValue = "Click Check Permissions to ask macOS for the missing grants."
            }
        }
    }

    private func currentPermissions() -> (accessibility: Bool, screenRecording: Bool) {
        (
            accessibility: AXIsProcessTrusted(),
            screenRecording: CGPreflightScreenCaptureAccess()
        )
    }

    private func configureStatusButton(_ button: NSButton) {
        button.translatesAutoresizingMaskIntoConstraints = false
        button.bezelStyle = .rounded
        button.isBordered = true
        button.target = nil
        button.action = nil
        button.alignment = .left
        button.refusesFirstResponder = true
    }

    private func updateStatusBadge(_ button: NSButton, accepted: Bool) {
        button.title = accepted ? "Accepted" : "Missing"
    }
}

private func writeLaunchCommand() throws -> URL {
    let support = try FileManager.default.url(
        for: .applicationSupportDirectory,
        in: .userDomainMask,
        appropriateFor: nil,
        create: true
    ).appendingPathComponent("MacBridge", isDirectory: true)

    try FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)

    let executable = URL(fileURLWithPath: CommandLine.arguments[0]).standardizedFileURL.path
    let zdotdir = support.appendingPathComponent("terminal-zdotdir", isDirectory: true)
    try FileManager.default.createDirectory(at: zdotdir, withIntermediateDirectories: true)
    try writeTerminalRC(executable: executable, zdotdir: zdotdir)

    let script = support.appendingPathComponent("open-macbridge.command")
    let body = """
    #!/bin/zsh
    export MACBRIDGE_BIN=\(shellQuote(executable))
    export ZDOTDIR=\(shellQuote(zdotdir.path))
    cd "$HOME"

    echo "MacBridge CLI"
    echo ""
    if "$MACBRIDGE_BIN" permissions check --require >/dev/null 2>&1; then
      echo "Permissions: ready"
    else
      echo "Permissions need attention:"
      "$MACBRIDGE_BIN" permissions check
    fi
    echo ""
    echo "Ready. This terminal has macbridge and mb commands loaded."
    echo "Try:"
    echo "  macbridge --help"
    echo "  macbridge windows list"
    echo ""
    exec /bin/zsh -i
    """

    try body.write(to: script, atomically: true, encoding: .utf8)
    chmod(script.path, 0o755)
    return script
}

private func writeTerminalRC(executable: String, zdotdir: URL) throws {
    let rc = zdotdir.appendingPathComponent(".zshrc")
    let body = """
    # Generated by MacBridge. This file is rewritten when the app opens Terminal.
    if [ -r "$HOME/.zshrc" ]; then
      source "$HOME/.zshrc"
    fi

    export MACBRIDGE_BIN=\(shellQuote(executable))
    export PATH="$(dirname "$MACBRIDGE_BIN"):/usr/local/bin:/opt/homebrew/bin:$PATH"
    macbridge() {
      "$MACBRIDGE_BIN" "$@"
    }
    mb() {
      "$MACBRIDGE_BIN" "$@"
    }
    """

    try body.write(to: rc, atomically: true, encoding: .utf8)
}

private func shellQuote(_ value: String) -> String {
    "'\(value.replacingOccurrences(of: "'", with: "'\"'\"'"))'"
}

private func launcherBrandImage() -> NSImage? {
    if let url = Bundle.main.url(forResource: "MacBridgeMark", withExtension: "png"),
       let image = NSImage(contentsOf: url)
    {
        return image
    }

    return NSImage(named: NSImage.applicationIconName)
}

private func openPrivacyPane(_ anchor: String) {
    guard
        let url = URL(
            string: "x-apple.systempreferences:com.apple.preference.security?\(anchor)"
        )
    else {
        return
    }

    NSWorkspace.shared.open(url)
}

private func void(_: Any) {}
