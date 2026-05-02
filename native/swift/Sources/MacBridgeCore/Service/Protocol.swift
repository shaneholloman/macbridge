import Darwin
import Foundation

struct ServiceRequest: Codable {
    var argv: [String]?
    var control: String?
}

struct ServiceResponse: Codable {
    var ok: Bool
    var stdout: String
    var stderr: String
    var exit: Int32
}

func makeSockaddrUn(path: String) -> sockaddr_un {
    var addr = sockaddr_un()
    addr.sun_family = sa_family_t(AF_UNIX)
    let capacity = MemoryLayout.size(ofValue: addr.sun_path)
    withUnsafeMutablePointer(to: &addr.sun_path) { ptr in
        ptr.withMemoryRebound(to: CChar.self, capacity: capacity) { cptr in
            _ = strlcpy(cptr, path, capacity)
        }
    }
    addr.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
    return addr
}

func bindServerSocket(path: String) throws -> Int32 {
    let fd = socket(AF_UNIX, SOCK_STREAM, 0)
    guard fd >= 0 else {
        throw CUAError.usage("socket() failed: \(String(cString: strerror(errno)))")
    }
    var addr = makeSockaddrUn(path: path)
    let len = socklen_t(MemoryLayout<sockaddr_un>.size)
    let bindResult = withUnsafePointer(to: &addr) { ptr -> Int32 in
        ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sptr in
            bind(fd, sptr, len)
        }
    }
    guard bindResult == 0 else {
        let msg = String(cString: strerror(errno))
        close(fd)
        throw CUAError.usage("bind(\(path)) failed: \(msg)")
    }
    guard listen(fd, 8) == 0 else {
        let msg = String(cString: strerror(errno))
        close(fd)
        throw CUAError.usage("listen() failed: \(msg)")
    }
    return fd
}

func connectClientSocket(path: String) throws -> Int32 {
    let fd = socket(AF_UNIX, SOCK_STREAM, 0)
    guard fd >= 0 else {
        throw CUAError.usage("socket() failed: \(String(cString: strerror(errno)))")
    }
    var addr = makeSockaddrUn(path: path)
    let len = socklen_t(MemoryLayout<sockaddr_un>.size)
    let result = withUnsafePointer(to: &addr) { ptr -> Int32 in
        ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sptr in
            connect(fd, sptr, len)
        }
    }
    guard result == 0 else {
        let msg = String(cString: strerror(errno))
        close(fd)
        throw CUAError.usage("connect(\(path)) failed: \(msg)")
    }
    return fd
}

func readJSONLine(fd: Int32) -> Data? {
    var buffer = Data()
    var chunk = [UInt8](repeating: 0, count: 4096)
    while true {
        let n = read(fd, &chunk, chunk.count)
        if n <= 0 { break }
        buffer.append(contentsOf: chunk.prefix(n))
        if buffer.contains(0x0a) { break }
    }
    if buffer.isEmpty { return nil }
    if let idx = buffer.firstIndex(of: 0x0a) {
        return buffer.subdata(in: buffer.startIndex..<idx)
    }
    return buffer
}

func writeAll(fd: Int32, _ data: Data) {
    var remaining = data
    while !remaining.isEmpty {
        let count = remaining.count
        let n = remaining.withUnsafeBytes { ptr -> Int in
            guard let base = ptr.baseAddress else { return -1 }
            return write(fd, base, count)
        }
        if n <= 0 { break }
        remaining.removeFirst(n)
    }
}

func sendResponse(fd: Int32, _ response: ServiceResponse) {
    guard let data = try? JSONEncoder().encode(response) else { return }
    var out = data
    out.append(0x0a)
    writeAll(fd: fd, out)
}

func captureOutput(_ body: () -> Void) -> (stdout: String, stderr: String) {
    fflush(Darwin.stdout)
    fflush(Darwin.stderr)

    let outPath = "\(NSTemporaryDirectory())macbridge-out-\(UUID().uuidString)"
    let errPath = "\(NSTemporaryDirectory())macbridge-err-\(UUID().uuidString)"

    let outFd = open(outPath, O_RDWR | O_CREAT | O_TRUNC, 0o600)
    let errFd = open(errPath, O_RDWR | O_CREAT | O_TRUNC, 0o600)
    guard outFd >= 0, errFd >= 0 else {
        if outFd >= 0 { close(outFd) }
        if errFd >= 0 { close(errFd) }
        body()
        return ("", "")
    }

    let savedStdout = dup(1)
    let savedStderr = dup(2)
    _ = dup2(outFd, 1)
    _ = dup2(errFd, 2)
    close(outFd)
    close(errFd)

    body()

    fflush(Darwin.stdout)
    fflush(Darwin.stderr)

    _ = dup2(savedStdout, 1)
    _ = dup2(savedStderr, 2)
    close(savedStdout)
    close(savedStderr)

    let outData = (try? Data(contentsOf: URL(fileURLWithPath: outPath))) ?? Data()
    let errData = (try? Data(contentsOf: URL(fileURLWithPath: errPath))) ?? Data()
    _ = try? FileManager.default.removeItem(atPath: outPath)
    _ = try? FileManager.default.removeItem(atPath: errPath)

    return (
        String(data: outData, encoding: .utf8) ?? "",
        String(data: errData, encoding: .utf8) ?? ""
    )
}
