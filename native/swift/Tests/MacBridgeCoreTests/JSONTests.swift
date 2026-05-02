@testable import MacBridgeCore
import Foundation
import XCTest

final class JSONTests: XCTestCase {
    func testJSONLineDataSerializesPayloadWithTrailingNewline() throws {
        let data = try jsonLineData(["ok": true, "items": [1, 2]])

        XCTAssertEqual(data.last, 0x0a)
        let payload = data.dropLast()
        let object = try JSONSerialization.jsonObject(with: Data(payload)) as? [String: Any]

        XCTAssertEqual(object?["ok"] as? Bool, true)
        XCTAssertEqual(object?["items"] as? [Int], [1, 2])
    }
}
