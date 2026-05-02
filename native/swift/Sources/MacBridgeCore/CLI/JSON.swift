import Foundation

func jsonLineData(_ object: Any) throws -> Data {
    var data = try JSONSerialization.data(withJSONObject: object, options: [])
    data.append(0x0a)
    return data
}

func printJSON(_ object: Any) throws {
    FileHandle.standardOutput.write(try jsonLineData(object))
}
