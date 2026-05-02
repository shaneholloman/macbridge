import ApplicationServices
import CoreGraphics
import Foundation

let pressableRoles: Set<String> = [
    "AXButton", "AXMenuItem", "AXMenuButton", "AXCheckBox", "AXRadioButton", "AXLink",
    "AXPopUpButton", "AXComboBox", "AXSegmentedControl", "AXDisclosureTriangle", "AXToolbarButton"
]
let selectableRoles: Set<String> = ["AXRow", "AXCell", "AXStaticText", "AXOutlineRow", "AXListItem"]
let textRoles: Set<String> = ["AXTextField", "AXTextArea"]

enum ClickPlan: String {
    case focusText = "focus_text"
    case press
    case selectPress = "select_press"
    case selectRowAttribute = "select_row_attr"
    case cg
}

func classify(_ element: AXUIElement?) -> (ClickPlan?, String) {
    let role = axRole(element)
    if textRoles.contains(role) { return (.focusText, role) }
    let actions = Set(axActions(element))
    if pressableRoles.contains(role), actions.contains(kAXPressAction) { return (.press, role) }
    if selectableRoles.contains(role), actions.contains(kAXPressAction) { return (.selectPress, role) }
    if role == "AXRow", isSettable(element, kAXSelectedAttribute as CFString) { return (.selectRowAttribute, role) }
    return (nil, role)
}

func isOpaqueAX(_ element: AXUIElement?) -> Bool {
    guard let element else { return true }
    let role = axRole(element)
    return role.isEmpty || role == "AXWindow" || role == "AXApplication"
}

func searchDescendants(_ element: AXUIElement?, maxDepth: Int = 3) -> (ClickPlan, AXUIElement, String)? {
    guard let element else { return nil }
    var queue: [(AXUIElement, Int)] = [(element, 0)]
    while !queue.isEmpty {
        let (current, depth) = queue.removeFirst()
        if depth > 0 {
            let (plan, role) = classify(current)
            if let plan { return (plan, current, role) }
        }
        if depth >= maxDepth { continue }
        let children = axGet(current, kAXChildrenAttribute as CFString) as? [AXUIElement] ?? []
        for child in children {
            queue.append((child, depth + 1))
        }
    }
    return nil
}

func searchDescendantsContainingPoint(_ element: AXUIElement?, point: CGPoint, maxDepth: Int = 6) -> (ClickPlan, AXUIElement, String)? {
    guard let element else { return nil }

    func visit(_ current: AXUIElement, depth: Int) -> (ClickPlan, AXUIElement, String)? {
        guard depth <= maxDepth else { return nil }

        let children = axGet(current, kAXChildrenAttribute as CFString) as? [AXUIElement] ?? []
        for child in children.reversed() {
            if let bounds = axBounds(child), bounds.contains(point),
               let hit = visit(child, depth: depth + 1) {
                return hit
            }
        }

        let (plan, role) = classify(current)
        if let plan,
           let bounds = axBounds(current),
           bounds.contains(point) {
            return (plan, current, role)
        }
        return nil
    }

    return visit(element, depth: 0)
}

func planClick(_ element: AXUIElement?, point: CGPoint? = nil) -> (ClickPlan, AXUIElement?, String) {
    guard let element else { return (.cg, nil, "") }
    let (directPlan, directRole) = classify(element)
    if let directPlan { return (directPlan, element, directRole) }
    if isOpaqueAX(element) { return (.cg, element, directRole) }

    var current = axParent(element)
    for _ in 0..<5 {
        guard let candidate = current else { break }
        let (plan, role) = classify(candidate)
        if let plan { return (plan, candidate, role) }
        if let point,
           let hit = searchDescendantsContainingPoint(candidate, point: point) {
            return hit
        }
        current = axParent(candidate)
    }

    if let hit = searchDescendants(element) {
        return hit
    }
    return (.cg, element, directRole)
}

func singleSelectRow(_ element: AXUIElement?) -> Bool {
    guard let element else { return false }
    if let parent = axParent(element),
       let siblings = axGet(parent, kAXChildrenAttribute as CFString) as? [AXUIElement] {
        for sibling in siblings where sibling !== element {
            if (axGet(sibling, kAXSelectedAttribute as CFString) as? Bool) == true {
                _ = axPress(sibling)
                usleep(30_000)
            }
        }
    }
    if (axGet(element, kAXSelectedAttribute as CFString) as? Bool) == true {
        _ = axPress(element)
        usleep(50_000)
    }
    return axPress(element)
}

func scrollableAncestor(_ element: AXUIElement?, maxDepth: Int = 15) -> AXUIElement? {
    var current = element
    for _ in 0..<maxDepth {
        guard let candidate = current else { return nil }
        let actions = Set(axActions(candidate))
        if actions.contains("AXScrollDownByPage") || actions.contains("AXScrollUpByPage") ||
            actions.contains("AXScrollLeftByPage") || actions.contains("AXScrollRightByPage") {
            return candidate
        }
        if axGet(candidate, "AXVerticalScrollBar" as CFString) != nil ||
            axGet(candidate, "AXHorizontalScrollBar" as CFString) != nil {
            return candidate
        }
        current = axParent(candidate)
    }
    return nil
}

func tryAXScroll(_ element: AXUIElement?, dx: CGFloat, dy: CGFloat) -> Bool {
    guard let scrollElement = scrollableAncestor(element) else { return false }
    let actions = Set(axActions(scrollElement))
    var did = false
    if dy != 0 {
        let action = dy > 0 ? "AXScrollDownByPage" : "AXScrollUpByPage"
        if actions.contains(action), AXUIElementPerformAction(scrollElement, action as CFString) == .success {
            did = true
        }
    }
    if dx != 0 {
        let action = dx > 0 ? "AXScrollRightByPage" : "AXScrollLeftByPage"
        if actions.contains(action), AXUIElementPerformAction(scrollElement, action as CFString) == .success {
            did = true
        }
    }
    return did
}

func performFirstAvailableAction(_ element: AXUIElement?, _ candidates: [String]) -> String? {
    guard let element else { return nil }
    let available = Set(axActions(element))
    for action in candidates where available.contains(action) {
        if AXUIElementPerformAction(element, action as CFString) == .success {
            return action
        }
    }
    return nil
}

func pressFocusedTextField(app: AXUIElement, key: String, modifiers: [String]) -> [String: Any]? {
    guard modifiers.isEmpty,
          ["Enter", "Return", "KP_Enter"].contains(key),
          let focused = axGet(app, kAXFocusedUIElementAttribute as CFString) as! AXUIElement?,
          textRoles.contains(axRole(focused)) else {
        return nil
    }

    if let action = performFirstAvailableAction(focused, ["AXConfirm"]) {
        return ["ok": true, "via": "ax", "action": action]
    }

    return nil
}
