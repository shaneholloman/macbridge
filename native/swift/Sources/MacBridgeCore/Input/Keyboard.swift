import AppKit
import CoreGraphics
import Foundation

let keyboard: [String: CGKeyCode] = [
    "a": 0, "b": 11, "c": 8, "d": 2, "e": 14, "f": 3, "g": 5, "h": 4, "i": 34, "j": 38,
    "k": 40, "l": 37, "m": 46, "n": 45, "o": 31, "p": 35, "q": 12, "r": 15, "s": 1,
    "t": 17, "u": 32, "v": 9, "w": 13, "x": 7, "y": 16, "z": 6,
    "0": 29, "1": 18, "2": 19, "3": 20, "4": 21, "5": 23, "6": 22, "7": 26, "8": 28, "9": 25,
    "-": 27, "=": 24, "`": 50, "[": 33, "]": 30, ";": 41, "'": 39, ",": 43, ".": 47, "/": 44, "\\": 42,
    "Tab": 48, " ": 49, "Space": 49, "Enter": 36, "Return": 36, "Backspace": 51, "Delete": 51,
    "ForwardDelete": 117, "ArrowUp": 126, "ArrowDown": 125, "ArrowLeft": 123, "ArrowRight": 124,
    "Up": 126, "Down": 125, "Left": 123, "Right": 124, "Escape": 53, "Esc": 53,
    "Home": 115, "End": 119, "PageUp": 116, "PageDown": 121,
    "F1": 122, "F2": 120, "F3": 99, "F4": 118, "F5": 96, "F6": 97, "F7": 98, "F8": 100,
    "F9": 101, "F10": 109, "F11": 103, "F12": 111
]

let shifted: [Character: String] = [
    "!": "1", "@": "2", "#": "3", "$": "4", "%": "5", "^": "6", "&": "7", "*": "8",
    "(": "9", ")": "0", "_": "-", "+": "=", "~": "`", "{": "[", "}": "]", ":": ";",
    "\"": "'", "<": ",", ">": ".", "?": "/", "|": "\\"
]

let modifierFlags: [String: CGEventFlags] = [
    "shift": .maskShift,
    "cmd": .maskCommand,
    "command": .maskCommand,
    "alt": .maskAlternate,
    "option": .maskAlternate,
    "opt": .maskAlternate,
    "ctrl": .maskControl,
    "control": .maskControl,
    "fn": .maskSecondaryFn
]

func keycodeForCharacter(_ character: Character) -> (CGKeyCode, Bool)? {
    let string = String(character)
    if string.lowercased() != string, let code = keyboard[string.lowercased()] {
        return (code, true)
    }
    if let base = shifted[character], let code = keyboard[base] {
        return (code, true)
    }
    if let code = keyboard[string] {
        return (code, false)
    }
    return nil
}

func flagsFor(_ modifiers: [String]) -> CGEventFlags {
    modifiers.reduce(CGEventFlags()) { partial, modifier in
        partial.union(modifierFlags[modifier.lowercased()] ?? [])
    }
}

func nsModifierFlags(_ modifiers: [String]) -> NSEvent.ModifierFlags {
    modifiers.reduce(NSEvent.ModifierFlags()) { partial, modifier in
        var result = partial
        switch modifier.lowercased() {
        case "shift":
            result.insert(.shift)
        case "cmd", "command":
            result.insert(.command)
        case "alt", "option", "opt":
            result.insert(.option)
        case "ctrl", "control":
            result.insert(.control)
        case "fn":
            result.insert(.function)
        default:
            break
        }
        return result
    }
}

func charactersForKey(_ key: String, modifiers: [String]) -> (String, String)? {
    switch key {
    case "Enter", "Return", "KP_Enter":
        return ("\r", "\r")
    case "Tab":
        return ("\t", "\t")
    case "Space", " ":
        return (" ", " ")
    case "Backspace", "Delete":
        return ("\u{8}", "\u{8}")
    case "Escape", "Esc":
        return ("\u{1b}", "\u{1b}")
    default:
        break
    }

    guard key.count == 1, let character = key.first else { return nil }
    let shift = modifiers.contains { $0.lowercased() == "shift" }
    if shift, let base = shifted[character] {
        return (String(character), base)
    }
    if shift {
        return (String(character).uppercased(), String(character).lowercased())
    }
    return (String(character), String(character).lowercased())
}
