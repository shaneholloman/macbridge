@testable import MacBridgeCore
import XCTest

final class KeyboardTests: XCTestCase {
    func testLowercaseCharacterMapsWithoutShift() {
        let mapping = keycodeForCharacter("a")

        XCTAssertEqual(mapping?.0, keyboard["a"])
        XCTAssertEqual(mapping?.1, false)
    }

    func testUppercaseCharacterMapsWithShift() {
        let mapping = keycodeForCharacter("A")

        XCTAssertEqual(mapping?.0, keyboard["a"])
        XCTAssertEqual(mapping?.1, true)
    }

    func testShiftedSymbolMapsToBaseKeyWithShift() {
        let mapping = keycodeForCharacter("!")

        XCTAssertEqual(mapping?.0, keyboard["1"])
        XCTAssertEqual(mapping?.1, true)
    }
}
