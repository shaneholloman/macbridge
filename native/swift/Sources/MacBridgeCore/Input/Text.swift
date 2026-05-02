import AppKit
import CoreGraphics
import Foundation

func cgKey(pid: pid_t, keycode: CGKeyCode, down: Bool, flags: CGEventFlags = []) {
    guard let event = CGEvent(keyboardEventSource: nil, virtualKey: keycode, keyDown: down) else { return }
    event.flags = flags
    event.postToPid(pid)
}

func cgKeyPress(pid: pid_t, keycode: CGKeyCode, flags: CGEventFlags = [], hold: useconds_t = 35_000) {
    cgKey(pid: pid, keycode: keycode, down: true, flags: flags)
    usleep(hold)
    cgKey(pid: pid, keycode: keycode, down: false, flags: flags)
}

func nsKeyPress(pid: pid_t, wid: CGWindowID, keycode: CGKeyCode, key: String, modifiers: [String], hold: useconds_t = 35_000) -> Bool {
    guard let (characters, charactersIgnoringModifiers) = charactersForKey(key, modifiers: modifiers) else {
        return false
    }
    let flags = nsModifierFlags(modifiers)
    let timestamp = ProcessInfo.processInfo.systemUptime
    guard let down = NSEvent.keyEvent(
        with: .keyDown,
        location: .zero,
        modifierFlags: flags,
        timestamp: timestamp,
        windowNumber: Int(wid),
        context: nil,
        characters: characters,
        charactersIgnoringModifiers: charactersIgnoringModifiers,
        isARepeat: false,
        keyCode: UInt16(keycode)
    )?.cgEvent else {
        return false
    }
    guard let up = NSEvent.keyEvent(
        with: .keyUp,
        location: .zero,
        modifierFlags: flags,
        timestamp: timestamp + Double(hold) / 1_000_000,
        windowNumber: Int(wid),
        context: nil,
        characters: characters,
        charactersIgnoringModifiers: charactersIgnoringModifiers,
        isARepeat: false,
        keyCode: UInt16(keycode)
    )?.cgEvent else {
        return false
    }
    down.postToPid(pid)
    usleep(hold)
    up.postToPid(pid)
    return true
}

func nsTypeText(pid: pid_t, wid: CGWindowID, text: String) -> Bool {
    var didType = false
    for character in text {
        guard let (code, needsShift) = keycodeForCharacter(character) else { return false }
        let modifiers = needsShift ? ["shift"] : []
        if nsKeyPress(pid: pid, wid: wid, keycode: code, key: String(character), modifiers: modifiers, hold: 3_000) {
            didType = true
        } else {
            return false
        }
        usleep(1_000)
    }
    return didType || text.isEmpty
}

func globalKey(keycode: CGKeyCode, down: Bool, flags: CGEventFlags = []) {
    guard let event = CGEvent(keyboardEventSource: nil, virtualKey: keycode, keyDown: down) else { return }
    event.flags = flags
    event.post(tap: .cghidEventTap)
}
