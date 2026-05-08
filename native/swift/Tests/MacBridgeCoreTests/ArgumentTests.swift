@testable import MacBridgeCore
import XCTest

final class ArgumentTests: XCTestCase {
    func testCoordinateOptionCanAppearAfterPositionals() throws {
        var cursor = ArgumentCursor(args: ["10", "20", "--coord", "normalized"])

        XCTAssertEqual(try cursor.popInt(), 10)
        XCTAssertEqual(try cursor.popInt(), 20)
        XCTAssertEqual(try cursor.parseCoord(), .normalized)
    }

    func testBackgroundHotkeyKeepsLastTokenAsKey() throws {
        var cursor = ArgumentCursor(args: ["cmd", "shift", "p", "--any-window"])
        let parsed = try parseBackgroundHotkey(cursor: &cursor)

        XCTAssertEqual(parsed.0, "p")
        XCTAssertEqual(parsed.1, ["cmd", "shift"])
        XCTAssertEqual(parsed.2, true)
    }

    func testWindowMaximizeOptionsParseDisplayMarginAndAnyWindow() throws {
        var cursor = ArgumentCursor(args: ["--display", "2", "--margin", "12", "--any-window"])
        let parsed = try parseWindowMaximizeOptions(cursor: &cursor)

        XCTAssertEqual(parsed.0, "2")
        XCTAssertEqual(parsed.1, 12)
        XCTAssertEqual(parsed.2, true)
    }

    func testBackgroundTypeOptionsParseActivationAndTiming() throws {
        var cursor = ArgumentCursor(args: ["--activate", "--key-hold-ms", "25", "--key-gap-ms", "15", "--any-window"])
        let parsed = try parseBackgroundTypeOptions(cursor: &cursor)

        XCTAssertNil(parsed.0)
        XCTAssertEqual(parsed.1, false)
        XCTAssertEqual(parsed.2, .pixel)
        XCTAssertEqual(parsed.3, true)
        XCTAssertEqual(parsed.4, true)
        XCTAssertEqual(parsed.5, 25_000)
        XCTAssertEqual(parsed.6, 15_000)
    }

    func testBackgroundPasteOptionsPreserveClipboardByDefault() throws {
        var cursor = ArgumentCursor(args: ["--activate", "--submit", "--any-window"])
        let parsed = try parseBackgroundPasteOptions(cursor: &cursor)

        XCTAssertNil(parsed.0)
        XCTAssertEqual(parsed.1, .pixel)
        XCTAssertEqual(parsed.2, true)
        XCTAssertEqual(parsed.3, true)
        XCTAssertEqual(parsed.4, true)
        XCTAssertEqual(parsed.5, true)
    }

    func testBackgroundPasteOptionsCanKeepClipboardText() throws {
        var cursor = ArgumentCursor(args: ["--keep-clipboard"])
        let parsed = try parseBackgroundPasteOptions(cursor: &cursor)

        XCTAssertEqual(parsed.5, false)
    }
}
