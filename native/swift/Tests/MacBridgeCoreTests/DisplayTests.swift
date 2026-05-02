@testable import MacBridgeCore
import XCTest

final class DisplayTests: XCTestCase {
    func testMainDisplayResolvesByDisplayIDAndIndex() throws {
        let main = mainDisplayInfo()

        XCTAssertEqual(try getDisplay("main").displayID, main.displayID)
        XCTAssertEqual(try getDisplay(String(main.displayID)).displayID, main.displayID)
        XCTAssertEqual(try getDisplay(String(main.index)).displayID, main.displayID)
    }
}
