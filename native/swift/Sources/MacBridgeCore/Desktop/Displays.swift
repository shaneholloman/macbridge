import AppKit
import CoreGraphics
import Foundation

struct DisplayInfo {
    let index: Int
    let displayID: CGDirectDisplayID
    let name: String
    let bounds: CGRect
    let pixelWidth: Int
    let pixelHeight: Int
    let scaleFactor: CGFloat
    let isMain: Bool
    let isBuiltin: Bool

    var jsonObject: [String: Any] {
        let visible = visibleFrame(self)
        return [
            "index": index,
            "displayID": Int(displayID),
            "screenNumber": Int(displayID),
            "name": name,
            "x": Int(bounds.origin.x),
            "y": Int(bounds.origin.y),
            "width": Int(bounds.width),
            "height": Int(bounds.height),
            "visibleX": Int(visible.origin.x),
            "visibleY": Int(visible.origin.y),
            "visibleWidth": Int(visible.width),
            "visibleHeight": Int(visible.height),
            "pixelWidth": pixelWidth,
            "pixelHeight": pixelHeight,
            "scaleFactor": Double(scaleFactor),
            "main": isMain,
            "builtin": isBuiltin
        ]
    }
}

private func screenNumber(_ screen: NSScreen) -> CGDirectDisplayID? {
    if let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber {
        return CGDirectDisplayID(number.uint32Value)
    }
    return nil
}

func listDisplays() -> [DisplayInfo] {
    NSScreen.screens.enumerated().compactMap { offset, screen in
        guard let displayID = screenNumber(screen) else { return nil }
        let bounds = CGDisplayBounds(displayID)
        return DisplayInfo(
            index: offset + 1,
            displayID: displayID,
            name: screen.localizedName,
            bounds: bounds,
            pixelWidth: CGDisplayPixelsWide(displayID),
            pixelHeight: CGDisplayPixelsHigh(displayID),
            scaleFactor: screen.backingScaleFactor,
            isMain: displayID == CGMainDisplayID(),
            isBuiltin: CGDisplayIsBuiltin(displayID) != 0
        )
    }
}

func getDisplay(_ target: String) throws -> DisplayInfo {
    let displays = listDisplays()
    guard !displays.isEmpty else {
        throw CUAError.usage("no active displays found")
    }

    if target == "main" || target == "primary" {
        if let display = displays.first(where: { $0.isMain }) {
            return display
        }
    }

    if let number = Int(target) {
        if let display = displays.first(where: { $0.index == number }) {
            return display
        }
        if let display = displays.first(where: { Int($0.displayID) == number }) {
            return display
        }
    }

    let matches = displays.filter {
        $0.name.range(of: target, options: [.caseInsensitive, .diacriticInsensitive]) != nil
    }
    if matches.count == 1 {
        return matches[0]
    }
    if matches.count > 1 {
        throw CUAError.usage("display name \"\(target)\" is ambiguous; use index or displayID")
    }

    throw CUAError.usage("display \"\(target)\" not found")
}

func displayInfo(_ display: DisplayInfo) -> [String: Any] {
    display.jsonObject
}

func mainDisplayInfo() -> DisplayInfo {
    (try? getDisplay("main")) ?? DisplayInfo(
        index: 1,
        displayID: CGMainDisplayID(),
        name: "Main Display",
        bounds: CGDisplayBounds(CGMainDisplayID()),
        pixelWidth: CGDisplayPixelsWide(CGMainDisplayID()),
        pixelHeight: CGDisplayPixelsHigh(CGMainDisplayID()),
        scaleFactor: NSScreen.main?.backingScaleFactor ?? 1.0,
        isMain: true,
        isBuiltin: CGDisplayIsBuiltin(CGMainDisplayID()) != 0
    )
}

func visibleFrame(_ display: DisplayInfo) -> CGRect {
    let screen = NSScreen.screens.first { screen in
        screenNumber(screen) == display.displayID
    }
    return screen?.visibleFrame ?? display.bounds
}
