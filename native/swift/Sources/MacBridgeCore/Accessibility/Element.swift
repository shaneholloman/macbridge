import ApplicationServices
import CoreGraphics
import Foundation

func axGet(_ element: AXUIElement?, _ attribute: CFString) -> Any? {
    guard let element else { return nil }
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, attribute, &value) == .success ? value : nil
}

func axSet(_ element: AXUIElement?, _ attribute: CFString, _ value: Any) -> Bool {
    guard let element else { return false }
    return AXUIElementSetAttributeValue(element, attribute, value as CFTypeRef) == .success
}

func axActions(_ element: AXUIElement?) -> [String] {
    guard let element else { return [] }
    var names: CFArray?
    guard AXUIElementCopyActionNames(element, &names) == .success,
          let names = names as? [String] else {
        return []
    }
    return names
}

func axPress(_ element: AXUIElement?) -> Bool {
    guard let element else { return false }
    return AXUIElementPerformAction(element, kAXPressAction as CFString) == .success
}

func axParent(_ element: AXUIElement?) -> AXUIElement? {
    axGet(element, kAXParentAttribute as CFString) as! AXUIElement?
}

func axBounds(_ element: AXUIElement?) -> CGRect? {
    guard let element,
          let positionValue = axGet(element, kAXPositionAttribute as CFString) as! AXValue?,
          let sizeValue = axGet(element, kAXSizeAttribute as CFString) as! AXValue? else {
        return nil
    }
    var position = CGPoint.zero
    var size = CGSize.zero
    guard AXValueGetValue(positionValue, .cgPoint, &position),
          AXValueGetValue(sizeValue, .cgSize, &size) else {
        return nil
    }
    return CGRect(origin: position, size: size)
}

func axRole(_ element: AXUIElement?) -> String {
    axGet(element, kAXRoleAttribute as CFString) as? String ?? ""
}

func isSettable(_ element: AXUIElement?, _ attribute: CFString) -> Bool {
    guard let element else { return false }
    var settable = DarwinBoolean(false)
    return AXUIElementIsAttributeSettable(element, attribute, &settable) == .success && settable.boolValue
}

func axAttributeNames(_ element: AXUIElement?) -> [String] {
    guard let element else { return [] }
    var names: CFArray?
    guard AXUIElementCopyAttributeNames(element, &names) == .success,
          let names = names as? [String] else {
        return []
    }
    return names
}

func axParameterizedAttributeNames(_ element: AXUIElement?) -> [String] {
    guard let element else { return [] }
    var names: CFArray?
    guard AXUIElementCopyParameterizedAttributeNames(element, &names) == .success,
          let names = names as? [String] else {
        return []
    }
    return names
}

func hitTest(app: AXUIElement, x: CGFloat, y: CGFloat) -> AXUIElement? {
    var element: AXUIElement?
    let error = AXUIElementCopyElementAtPosition(app, Float(x), Float(y), &element)
    return error == .success ? element : nil
}

func attach(_ wid: CGWindowID) throws -> (pid_t, AXUIElement, CGRect) {
    let window = try getWindow(wid)
    let app = AXUIElementCreateApplication(window.pid)
    AXUIElementSetMessagingTimeout(app, 2.0)
    _ = axSet(app, "AXEnhancedUserInterface" as CFString, true)
    _ = axSet(app, "AXManualAccessibility" as CFString, true)
    return (window.pid, app, window.bounds)
}
