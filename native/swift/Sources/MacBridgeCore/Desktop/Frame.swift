import ApplicationServices
import CoreGraphics
import Foundation

func axWindow(for wid: CGWindowID) throws -> AXUIElement {
    let window = try getWindow(wid)
    let app = AXUIElementCreateApplication(window.pid)
    AXUIElementSetMessagingTimeout(app, 2.0)
    _ = axSet(app, "AXEnhancedUserInterface" as CFString, true)
    _ = axSet(app, "AXManualAccessibility" as CFString, true)

    let candidates = (axGet(app, kAXWindowsAttribute as CFString) as? [AXUIElement] ?? [])
        .compactMap { candidate -> (AXUIElement, CGRect)? in
            guard let bounds = axBounds(candidate) else { return nil }
            return (candidate, bounds)
        }
    if let best = candidates.min(by: { lhs, rhs in
        rectDistanceSquared(lhs.1, window.bounds) < rectDistanceSquared(rhs.1, window.bounds)
    })?.0 {
        return best
    }

    if let focused = axGet(app, kAXFocusedWindowAttribute as CFString) as! AXUIElement? {
        return focused
    }
    if let main = axGet(app, kAXMainWindowAttribute as CFString) as! AXUIElement? {
        return main
    }
    throw CUAError.usage("no accessibility window found for \(wid)")
}

func frameObject(wid: CGWindowID, frame: CGRect) -> [String: Any] {
    [
        "wid": Int(wid),
        "x": Int(frame.origin.x),
        "y": Int(frame.origin.y),
        "width": Int(frame.width),
        "height": Int(frame.height)
    ]
}

func windowFrame(wid: CGWindowID) throws -> [String: Any] {
    let window = try getWindow(wid)
    return frameObject(wid: wid, frame: window.bounds)
}

func setWindowFrame(wid: CGWindowID, frame: CGRect) throws -> [String: Any] {
    guard frame.width >= 100, frame.height >= 100 else {
        throw CUAError.usage("window frame must be at least 100x100")
    }

    let window = try axWindow(for: wid)
    guard isSettable(window, kAXPositionAttribute as CFString) else {
        throw CUAError.usage("window \(wid) position is not settable")
    }
    guard isSettable(window, kAXSizeAttribute as CFString) else {
        throw CUAError.usage("window \(wid) size is not settable")
    }

    var size = frame.size
    var position = frame.origin
    guard let sizeValue = AXValueCreate(.cgSize, &size),
          let positionValue = AXValueCreate(.cgPoint, &position) else {
        throw CUAError.usage("failed to create accessibility frame values")
    }

    guard axSet(window, kAXSizeAttribute as CFString, sizeValue),
          axSet(window, kAXPositionAttribute as CFString, positionValue) else {
        throw CUAError.usage("failed to set window \(wid) frame")
    }

    usleep(120_000)
    return frameObject(wid: wid, frame: axBounds(window) ?? frame)
}

func maximizeWindow(wid: CGWindowID, displayTarget: String, margin: CGFloat) throws -> [String: Any] {
    guard margin >= 0 else { throw CUAError.usage("margin must be non-negative") }
    let display = try getDisplay(displayTarget)
    let visible = visibleFrame(display)
    let frame = visible.insetBy(dx: margin, dy: margin)
    return try setWindowFrame(wid: wid, frame: frame)
}

func activateWindow(wid: CGWindowID) throws -> [String: Any] {
    let window = try getWindow(wid)
    guard let app = appForPID(window.pid) else {
        throw CUAError.usage("no running app found for window \(wid)")
    }

    app.unhide()
    let axApp = AXUIElementCreateApplication(window.pid)
    AXUIElementSetMessagingTimeout(axApp, 2.0)
    _ = axSet(axApp, kAXFrontmostAttribute as CFString, true)
    let activated = app.activate(options: [.activateIgnoringOtherApps])
    let axWindow = try? axWindow(for: wid)
    if let axWindow {
        _ = AXUIElementPerformAction(axWindow, kAXRaiseAction as CFString)
        _ = axSet(axWindow, kAXFocusedAttribute as CFString, true)
        _ = axSet(axWindow, "AXMain" as CFString, true)
    }

    usleep(180_000)
    return [
        "wid": Int(wid),
        "pid": Int(window.pid),
        "owner": window.owner,
        "active": app.isActive,
        "activated": activated
    ]
}
