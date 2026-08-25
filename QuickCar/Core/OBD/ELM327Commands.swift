import Foundation

enum ELM327Commands {
    static let reset = "ATZ"
    static let echoOff = "ATE0"
    static let linefeedOff = "ATL0"
    static let spacesOff = "ATS0"
    static let headersOff = "ATH0"
    static let adaptiveTiming = "ATAT1"
    static let autoProtocol = "ATSP0"
    static let supportedPIDs00 = "0100"
    static let supportedPIDs20 = "0120"
    static let supportedPIDs40 = "0140"
    static let readDTCs = "03"
    static let readPendingDTCs = "07"
    static let readPermanentDTCs = "0A"
    static let clearDTCs = "04"

    static func mode01(_ pid: UInt8) -> String {
        String(format: "01%02X", pid)
    }

    /// ISO-TP header targeting DME (functional/physical request on many F-series).
    static let headerDME = "ATSH7E0"
    static let protocolCAN11_500 = "ATSP6"
    /// BMW F30/N13 MEVD1725 oil temperature (Mode 22 DID 0xD3B0).
    static let bmwOilTempMode22 = "22D3B0"

    /// Note: ATS0 (spaces off) omitted — VLinker MC-iOS / some clones mis-handle spaced replies when disabled early.
    static let initSequence: [(command: String, delayAfter: TimeInterval)] = [
        (reset, 1.5),
        (echoOff, 0.2),
        (linefeedOff, 0.2),
        (headersOff, 0.2),
        (adaptiveTiming, 0.2),
        (autoProtocol, 0.5),
        (supportedPIDs00, 0.4)
    ]
}
