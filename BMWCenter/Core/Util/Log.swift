import Foundation
import os.log

enum Log {
    private static let subsystem = Bundle.main.bundleIdentifier ?? "BMWCenter"
    private static let logger = Logger(subsystem: subsystem, category: "app")

    static func debug(_ message: String) {
        logger.debug("\(message, privacy: .public)")
    }

    static func info(_ message: String) {
        logger.info("\(message, privacy: .public)")
    }

    static func error(_ message: String) {
        logger.error("\(message, privacy: .public)")
    }
}
