import ApplicationServices
import CoreGraphics
import Foundation

func axDebugValue(_ value: Any?) -> Any? {
    guard let value else { return nil }
    if let string = value as? String { return string }
    if let number = value as? NSNumber { return number }
    if let array = value as? [Any] { return array.prefix(12).compactMap(axDebugValue) }
    if CFGetTypeID(value as CFTypeRef) == AXUIElementGetTypeID() {
        return compactAXInfo((value as! AXUIElement))
    }
    if CFGetTypeID(value as CFTypeRef) == AXValueGetTypeID() {
        let axValue = value as! AXValue
        switch AXValueGetType(axValue) {
        case .cgPoint:
            var point = CGPoint.zero
            AXValueGetValue(axValue, .cgPoint, &point)
            return ["x": point.x, "y": point.y]
        case .cgSize:
            var size = CGSize.zero
            AXValueGetValue(axValue, .cgSize, &size)
            return ["width": size.width, "height": size.height]
        case .cgRect:
            var rect = CGRect.zero
            AXValueGetValue(axValue, .cgRect, &rect)
            return ["x": rect.origin.x, "y": rect.origin.y, "width": rect.width, "height": rect.height]
        case .cfRange:
            var range = CFRange()
            AXValueGetValue(axValue, .cfRange, &range)
            return ["location": range.location, "length": range.length]
        case .axError, .illegal:
            return String(describing: value)
        @unknown default:
            return String(describing: value)
        }
    }
    return String(describing: value)
}

func compactAXInfo(_ element: AXUIElement?) -> [String: Any] {
    guard let element else { return [:] }
    let interestingAttributes: [CFString] = [
        kAXRoleAttribute as CFString,
        kAXSubroleAttribute as CFString,
        kAXTitleAttribute as CFString,
        kAXValueAttribute as CFString,
        kAXSelectedTextAttribute as CFString,
        kAXSelectedTextRangeAttribute as CFString,
        kAXDescriptionAttribute as CFString,
        "AXPlaceholderValue" as CFString,
        "AXDOMIdentifier" as CFString,
        kAXFocusedAttribute as CFString,
        kAXEnabledAttribute as CFString,
        kAXSelectedAttribute as CFString
    ]
    var object: [String: Any] = [:]
    for attribute in interestingAttributes {
        if let value = axDebugValue(axGet(element, attribute)) {
            object[attribute as String] = value
        }
    }
    if let bounds = axBounds(element) {
        object["bounds"] = ["x": bounds.origin.x, "y": bounds.origin.y, "width": bounds.width, "height": bounds.height]
    }
    object["actions"] = axActions(element)
    object["settable"] = axAttributeNames(element).filter { isSettable(element, $0 as CFString) }
    object["parameterized"] = axParameterizedAttributeNames(element)
    return object
}

func axAncestorChain(_ element: AXUIElement?, maxDepth: Int = 8) -> [[String: Any]] {
    var result: [[String: Any]] = []
    var current = element
    for _ in 0..<maxDepth {
        guard let candidate = current else { break }
        result.append(compactAXInfo(candidate))
        current = axParent(candidate)
    }
    return result
}

func axChildrenSummary(_ element: AXUIElement?, maxDepth: Int = 3, maxItems: Int = 80) -> [[String: Any]] {
    guard let element else { return [] }
    var result: [[String: Any]] = []
    var queue: [(AXUIElement, Int)] = [(element, 0)]
    while !queue.isEmpty, result.count < maxItems {
        let (current, depth) = queue.removeFirst()
        if depth > 0 {
            var info = compactAXInfo(current)
            info["depth"] = depth
            result.append(info)
        }
        if depth >= maxDepth { continue }
        let children = axGet(current, kAXChildrenAttribute as CFString) as? [AXUIElement] ?? []
        for child in children {
            queue.append((child, depth + 1))
        }
    }
    return result
}

func axDump(wid: CGWindowID, x: CGFloat, y: CGFloat, coord: CoordMode) throws -> [String: Any] {
    let (_, app, bounds) = try attach(wid)
    let point = toGlobal(bounds: bounds, x: x, y: y, coord: coord)
    let hit = hitTest(app: app, x: point.x, y: point.y)
    let (plan, target, role) = planClick(hit, point: point)
    let focused = axGet(app, kAXFocusedUIElementAttribute as CFString) as! AXUIElement?
    return [
        "window": Int(wid),
        "point": ["x": point.x, "y": point.y],
        "hit": compactAXInfo(hit),
        "plan": ["name": plan.rawValue, "role": role],
        "target": compactAXInfo(target),
        "targetAncestors": axAncestorChain(target),
        "focused": compactAXInfo(focused),
        "focusedAncestors": axAncestorChain(focused),
        "appChildren": axChildrenSummary(app, maxDepth: 2, maxItems: 80)
    ]
}

func axAction(wid: CGWindowID, x: CGFloat, y: CGFloat, action: String, coord: CoordMode) throws -> [String: Any] {
    let (_, app, bounds) = try attach(wid)
    let point = toGlobal(bounds: bounds, x: x, y: y, coord: coord)
    let hit = hitTest(app: app, x: point.x, y: point.y)
    let (plan, target, role) = planClick(hit, point: point)
    let ok = target.map { AXUIElementPerformAction($0, action as CFString) == .success } ?? false
    return [
        "ok": ok,
        "action": action,
        "plan": plan.rawValue,
        "role": role,
        "target": compactAXInfo(target)
    ]
}
