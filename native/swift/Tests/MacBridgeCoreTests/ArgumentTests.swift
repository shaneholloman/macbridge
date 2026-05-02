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
}
