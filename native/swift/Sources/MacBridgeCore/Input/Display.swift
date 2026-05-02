import CoreGraphics
import Foundation

func clickGlobal(x: CGFloat, y: CGFloat, coord: CoordMode, hold: useconds_t = 50_000) -> [String: Any] {
    let point = displayPoint(x: x, y: y, coord: coord)
    globalMouseEvent(.leftMouseDown, point: point, button: .left)
    usleep(hold)
    globalMouseEvent(.leftMouseUp, point: point, button: .left)
    return ["plan": "global", "ok": true]
}

func rightClickGlobal(x: CGFloat, y: CGFloat, coord: CoordMode) -> [String: Any] {
    let point = displayPoint(x: x, y: y, coord: coord)
    globalMouseEvent(.rightMouseDown, point: point, button: .right)
    usleep(50_000)
    globalMouseEvent(.rightMouseUp, point: point, button: .right)
    return ["plan": "global", "ok": true]
}

func doubleClickGlobal(x: CGFloat, y: CGFloat, coord: CoordMode) -> [String: Any] {
    _ = clickGlobal(x: x, y: y, coord: coord)
    usleep(80_000)
    _ = clickGlobal(x: x, y: y, coord: coord)
    return ["plan": "double", "ok": true]
}

func dragGlobal(x1: CGFloat, y1: CGFloat, x2: CGFloat, y2: CGFloat, coord: CoordMode, steps: Int, duration: Double) -> [String: Any] {
    let start = displayPoint(x: x1, y: y1, coord: coord)
    let end = displayPoint(x: x2, y: y2, coord: coord)
    let count = max(steps, 1)
    globalMouseEvent(.leftMouseDown, point: start, button: .left)
    for i in 1...count {
        let t = CGFloat(i) / CGFloat(count)
        let point = CGPoint(x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t)
        globalMouseEvent(.leftMouseDragged, point: point, button: .left)
        usleep(useconds_t((duration / Double(count)) * 1_000_000))
    }
    globalMouseEvent(.leftMouseUp, point: end, button: .left)
    return ["ok": true]
}

func clickDisplay(display: DisplayInfo, x: CGFloat, y: CGFloat, coord: CoordMode, hold: useconds_t = 50_000) -> [String: Any] {
    let point = displayPoint(display: display, x: x, y: y, coord: coord)
    globalMouseEvent(.leftMouseDown, point: point, button: .left)
    usleep(hold)
    globalMouseEvent(.leftMouseUp, point: point, button: .left)
    return ["plan": "global", "displayID": Int(display.displayID), "ok": true]
}

func rightClickDisplay(display: DisplayInfo, x: CGFloat, y: CGFloat, coord: CoordMode) -> [String: Any] {
    let point = displayPoint(display: display, x: x, y: y, coord: coord)
    globalMouseEvent(.rightMouseDown, point: point, button: .right)
    usleep(50_000)
    globalMouseEvent(.rightMouseUp, point: point, button: .right)
    return ["plan": "global", "displayID": Int(display.displayID), "ok": true]
}

func doubleClickDisplay(display: DisplayInfo, x: CGFloat, y: CGFloat, coord: CoordMode) -> [String: Any] {
    _ = clickDisplay(display: display, x: x, y: y, coord: coord)
    usleep(80_000)
    _ = clickDisplay(display: display, x: x, y: y, coord: coord)
    return ["plan": "double", "displayID": Int(display.displayID), "ok": true]
}

func dragDisplay(display: DisplayInfo, x1: CGFloat, y1: CGFloat, x2: CGFloat, y2: CGFloat, coord: CoordMode, steps: Int, duration: Double) -> [String: Any] {
    let start = displayPoint(display: display, x: x1, y: y1, coord: coord)
    let end = displayPoint(display: display, x: x2, y: y2, coord: coord)
    let count = max(steps, 1)
    globalMouseEvent(.leftMouseDown, point: start, button: .left)
    for i in 1...count {
        let t = CGFloat(i) / CGFloat(count)
        let point = CGPoint(x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t)
        globalMouseEvent(.leftMouseDragged, point: point, button: .left)
        usleep(useconds_t((duration / Double(count)) * 1_000_000))
    }
    globalMouseEvent(.leftMouseUp, point: end, button: .left)
    return ["displayID": Int(display.displayID), "ok": true]
}

func typeDisplay(display: DisplayInfo, text: String, at: (CGFloat, CGFloat)?, coord: CoordMode) throws -> [String: Any] {
    if let at {
        _ = clickDisplay(display: display, x: at.0, y: at.1, coord: coord)
        usleep(80_000)
    }
    for character in text {
        guard let (code, needsShift) = keycodeForCharacter(character) else { continue }
        let flags: CGEventFlags = needsShift ? .maskShift : []
        globalKey(keycode: code, down: true, flags: flags)
        globalKey(keycode: code, down: false, flags: flags)
    }
    return ["displayID": Int(display.displayID), "via": "cg"]
}

func scrollGlobal(dx: CGFloat, dy: CGFloat) -> [String: Any] {
    globalScroll(dx: dx, dy: dy)
    return ["via": "cg"]
}

func typeGlobal(text: String, at: (CGFloat, CGFloat)?, coord: CoordMode) throws -> [String: Any] {
    if let at {
        _ = clickGlobal(x: at.0, y: at.1, coord: coord)
        usleep(80_000)
    }
    for character in text {
        guard let (code, needsShift) = keycodeForCharacter(character) else { continue }
        let flags: CGEventFlags = needsShift ? .maskShift : []
        globalKey(keycode: code, down: true, flags: flags)
        globalKey(keycode: code, down: false, flags: flags)
    }
    return ["via": "cg"]
}

func pressGlobal(key: String, modifiers: [String]) throws -> [String: Any] {
    var mods = modifiers
    var code = keyboard[key]
    if code == nil, key.count == 1, let result = keycodeForCharacter(Character(key)) {
        code = result.0
        if result.1 { mods.append("shift") }
    }
    guard let code else { throw CUAError.unknownKey(key) }
    let flags = flagsFor(mods)
    globalKey(keycode: code, down: true, flags: flags)
    globalKey(keycode: code, down: false, flags: flags)
    return ["ok": true]
}
