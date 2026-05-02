import ApplicationServices
import CoreGraphics
import Foundation

func permissionReport(prompt: Bool = false) -> [String: Any] {
    let accessibility = prompt
        ? AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary)
        : AXIsProcessTrusted()
    let screenRecording = prompt ? CGRequestScreenCaptureAccess() : CGPreflightScreenCaptureAccess()
    let permissions: [[String: Any]] = [
        [
            "id": "accessibility",
            "name": "Accessibility",
            "granted": accessibility,
            "requiredFor": ["click", "type", "press", "hotkey", "accessibility inspection"],
        ],
        [
            "id": "screen-recording",
            "name": "Screen Recording",
            "granted": screenRecording,
            "requiredFor": ["capture", "screenshots", "display inspection"],
        ],
    ]

    return [
        "ok": accessibility && screenRecording,
        "prompted": prompt,
        "permissions": permissions,
        "notes": [
            "Grant permissions to the launching terminal/app or to the signed macbridge binary.",
            "Restart the launching process after changing macOS privacy permissions.",
        ],
    ]
}

func runPermissionsSubcommand(cursor: inout ArgumentCursor) throws {
    guard !cursor.args.isEmpty else { throw CUAError.usage("permissions needs a command") }
    let command = try cursor.pop()
    switch command {
    case "check":
        var prompt = false
        var require = false
        while !cursor.args.isEmpty {
            let arg = try cursor.pop()
            switch arg {
            case "--prompt":
                prompt = true
            case "--require":
                require = true
            default:
                throw CUAError.usage("unknown permissions check option: \(arg)")
            }
        }

        let report = permissionReport(prompt: prompt)
        try printJSON(report)
        if require, (report["ok"] as? Bool) != true {
            throw CUAError.usage("required macOS permissions are missing")
        }
    default:
        throw CUAError.usage("unknown permissions command: \(command)")
    }
}
