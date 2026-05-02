import AppKit
import CoreGraphics
import Foundation

func writeImage(_ image: CGImage, path: String, format: String, quality: CGFloat) throws {
    let rep = NSBitmapImageRep(cgImage: image)
    let data: Data?
    if format == "png" {
        data = rep.representation(using: .png, properties: [:])
    } else {
        data = rep.representation(using: .jpeg, properties: [.compressionFactor: quality])
    }
    guard let data else {
        throw CUAError.imageWriteFailed(path)
    }
    do {
        let url = URL(fileURLWithPath: path)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url)
    } catch {
        throw CUAError.imageWriteFailed(path)
    }
}

func screenshotDisplay(path: String, format: String, quality: CGFloat) throws {
    try screenshotDisplay(display: mainDisplayInfo(), path: path, format: format, quality: quality)
}

func screenshotDisplay(display: DisplayInfo, path: String, format: String, quality: CGFloat) throws {
    guard let image = CGWindowListCreateImage(
        display.bounds,
        .optionOnScreenOnly,
        kCGNullWindowID,
        [.boundsIgnoreFraming, .nominalResolution]
    ) else {
        throw CUAError.imageWriteFailed(path)
    }
    try writeImage(image, path: path, format: format, quality: quality)
}

func screenshot(wid: CGWindowID, path: String, format: String, quality: CGFloat) throws {
    let window = try getWindow(wid)
    if let image = CGWindowListCreateImage(
        window.bounds,
        .optionIncludingWindow,
        wid,
        [.boundsIgnoreFraming, .nominalResolution]
    ) {
        try writeImage(image, path: path, format: format, quality: quality)
        return
    }

    guard #available(macOS 14.0, *) else {
        throw CUAError.screenshotFailed(wid)
    }
    let image = try sckWindowImage(wid: wid)
    try writeImage(image, path: path, format: format, quality: quality)
}
