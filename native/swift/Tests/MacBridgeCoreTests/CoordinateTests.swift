import CoreGraphics
@testable import MacBridgeCore
import XCTest

final class CoordinateTests: XCTestCase {
    func testPixelCoordinatesAreWindowLocal() {
        let bounds = CGRect(x: 100, y: 200, width: 800, height: 600)
        let point = toGlobal(bounds: bounds, x: 25, y: 40, coord: .pixel)

        XCTAssertEqual(point.x, 125)
        XCTAssertEqual(point.y, 240)
    }

    func testNormalizedCoordinatesScaleWithinBounds() {
        let bounds = CGRect(x: -100, y: 50, width: 800, height: 600)
        let point = toGlobal(bounds: bounds, x: 0.25, y: 0.5, coord: .normalized)

        XCTAssertEqual(point.x, 100)
        XCTAssertEqual(point.y, 350)
    }

    func testGlobalCoordinatesPassThrough() {
        let bounds = CGRect(x: 100, y: 200, width: 800, height: 600)
        let point = toGlobal(bounds: bounds, x: 12, y: 34, coord: .global)

        XCTAssertEqual(point.x, 12)
        XCTAssertEqual(point.y, 34)
    }
}
