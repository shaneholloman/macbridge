import AppKit
import CoreGraphics
import Dispatch
import Foundation
import ScreenCaptureKit

@available(macOS 14.0, *)
func sckWindowImage(wid: CGWindowID) throws -> CGImage {
    _ = NSApplication.shared

    var result: Result<CGImage, Error>?
    let semaphore = DispatchSemaphore(value: 0)

    let capture = {
        SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: false) { content, error in
            guard let content else {
                result = .failure(error ?? CUAError.screenshotFailed(wid))
                semaphore.signal()
                return
            }
            guard let window = content.windows.first(where: { $0.windowID == wid }) else {
                result = .failure(CUAError.screenshotFailed(wid))
                semaphore.signal()
                return
            }

            let filter = SCContentFilter(desktopIndependentWindow: window)
            let info = SCShareableContent.info(for: filter)
            let configuration = SCStreamConfiguration()
            configuration.width = max(1, Int(round(info.contentRect.width)))
            configuration.height = max(1, Int(round(info.contentRect.height)))
            configuration.showsCursor = false
            configuration.scalesToFit = true
            configuration.ignoreShadowsSingleWindow = true
            configuration.shouldBeOpaque = true

            SCScreenshotManager.captureImage(contentFilter: filter, configuration: configuration) { image, error in
                if let image {
                    result = .success(image)
                } else {
                    result = .failure(error ?? CUAError.screenshotFailed(wid))
                }
                semaphore.signal()
            }
        }
    }

    if Thread.isMainThread {
        capture()
    } else {
        DispatchQueue.main.async(execute: capture)
    }

    while semaphore.wait(timeout: .now()) == .timedOut {
        RunLoop.main.run(mode: .default, before: Date(timeIntervalSinceNow: 0.05))
    }

    switch result {
    case .success(let image):
        return image
    case .failure:
        throw CUAError.screenshotFailed(wid)
    case .none:
        throw CUAError.screenshotFailed(wid)
    }
}
