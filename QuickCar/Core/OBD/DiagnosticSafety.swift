import Foundation

/// How disruptive a diagnostic operation is (PRD §186 Safety Rule: Read vs Write).
/// Every diagnostic function should be classified as one of these — read-only
/// operations never require confirmation; the others do.
enum DiagnosticOperationKind: Sendable, Equatable {
    case readOnly
    case serviceWrite
    case codingWrite
    case securitySensitive
}

/// Thrown when a non-read-only diagnostic operation is invoked without its
/// caller explicitly passing `confirmed: true`. This makes it structurally
/// impossible for a new call site (e.g. a future Siri/App Intent shortcut,
/// PRD §210) to trigger a destructive action without an explicit, visible
/// opt-in at the call site — not just a UI dialog that a future screen might
/// forget to add.
struct DiagnosticConfirmationRequired: Error, Equatable, Sendable {
    let operation: String
}
