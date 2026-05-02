import CoreGraphics
import Foundation

func mouseEvent(_ type: CGEventType, point: CGPoint, button: CGMouseButton) -> CGEvent? {
    CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: button)
}

func globalMouseEvent(_ type: CGEventType, point: CGPoint, button: CGMouseButton) {
    mouseEvent(type, point: point, button: button)?.post(tap: .cghidEventTap)
}

func globalScroll(dx: CGFloat, dy: CGFloat) {
    CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 2, wheel1: Int32(dy), wheel2: Int32(dx), wheel3: 0)?.post(tap: .cghidEventTap)
}

func cgMouseDown(pid: pid_t, point: CGPoint, button: CGMouseButton = .left) {
    let type: CGEventType = button == .right ? .rightMouseDown : .leftMouseDown
    mouseEvent(type, point: point, button: button)?.postToPid(pid)
}

func cgMouseUp(pid: pid_t, point: CGPoint, button: CGMouseButton = .left) {
    let type: CGEventType = button == .right ? .rightMouseUp : .leftMouseUp
    mouseEvent(type, point: point, button: button)?.postToPid(pid)
}

func cgMove(pid: pid_t, point: CGPoint) {
    mouseEvent(.mouseMoved, point: point, button: .left)?.postToPid(pid)
}

func cgScroll(pid: pid_t, dx: CGFloat, dy: CGFloat) {
    CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 2, wheel1: Int32(dy), wheel2: Int32(dx), wheel3: 0)?.postToPid(pid)
}
