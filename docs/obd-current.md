# BMWCenter — Current BLE/OBD Protocol Flow (Phase 0 Audit)

**Status:** Snapshot as of 2026-08-07, before any Phase 1+ refactoring. Read-only description of what exists today — not a design proposal.

Scope: `BMWCenter/Core/OBD/` — `OBDTransport.swift`, `BLEOBDTransport.swift`, `MockOBDTransport.swift`, `ELM327Commands.swift`, `OBDFrameParser.swift`, `OBDPID.swift`, `VehicleSnapshot.swift`, `OBDService.swift`, `DTCService.swift`, `DTCMonitor.swift`, `VINDecoder.swift`, `VLinker/ExtendedPIDSession.swift`, `VLinker/VLinkerPIDCatalog.swift`.

## 1. BLE connection flow

`BLEOBDTransport` (`BLEOBDTransport.swift`) is a single `NSObject` that owns one `CBCentralManager` (`.main` queue) and conforms to both `CBCentralManagerDelegate` and `CBPeripheralDelegate`. It implements the `OBDTransport` protocol (`OBDTransport.swift:27-35`), which exposes an `AsyncStream<OBDConnectionState>` for state and `AsyncStream<[DiscoveredAdapter]>` for scan results — there is no delegate/callback API beyond two closures (`onBluetoothPoweredOn`, `onDisconnected`).

**Power-on gating**: `waitUntilPoweredOn` polls `central.state` in a 100ms loop up to a timeout before any scan/connect is allowed.

**Scanning** (`startScan`): guarded so it never runs while a session is already live (`if case .connected = lastState, writeChar != nil { return }`) and never while `isConnecting`. It scans first with a filtered service list (`serviceCandidates`) and after 1s widens to `scanForPeripherals(withServices: nil, …)` if still scanning, to catch adapters that don't advertise recognized service UUIDs. `didDiscover` filters by advertised service UUID match **or** name substring match against a hardcoded `nameFilter` list: `"OBD","ELM","VGATE","VLINKER","V-LINKER","VEEPEAK","ICAR","MC-IOS","MC+","IOS-VLINK","IOS-VLINKER","VLINK"`.

**Service/characteristic targets**: the transport is explicitly VLinker-first.
- Primary target: `vlinkerService` = `E7810A71-73AE-499D-8C15-FAA9AEF0C3F2`, `vlinkerSerial` characteristic = `BEF8D6C9-9C21-4C9E-B632-BD58C1009F9F` — same UUID used for both write and notify, comment calls it "Vgate / VLinker MC-iOS proprietary serial service."
- Fallback `serviceCandidates` list: `vlinkerService`, `FFF0`, `FFE0`, `18F0`, Nordic UART service `6E400001-…`.
- Characteristic adoption uses a numeric priority scheme (`adoptWrite`/`adoptNotify`) so a higher-priority candidate always wins over a lower one already found: VLinker serial = 100, Nordic UART RX/TX = 80, `FFE1` = 70, `FFF2`/`FFF1` = 60, `2AF1`/`2AF0` = 20. `useCRLF` is forced true only when the VLinker serial UUID is adopted — every other candidate uses bare `\r` line endings.
- Service discovery (`discoverSerialServices`) requests the candidate list first; if the VLinker serial hasn't been locked (`writePriority < 100`) within 1.5s, it falls back to a full `discoverServices(nil)` scan.

**Connect flow** (`connect(peripheralID:)`, `connectUnlocked`): connect calls are deduplicated via a single in-flight `connectTask` so concurrent callers (app launch, BT-power-on callback, UI tap) await the same attempt. Before connecting, `teardownForReconnect` tears down any stale peripheral/GATT session, cancels pending response continuations, and sleeps 450ms after `cancelPeripheralConnection` to let the stack settle. It resolves the `CBPeripheral` from the cached dictionary, `retrievePeripherals(withIdentifiers:)`, `retrieveConnectedPeripherals(withServices:)`, or as a last resort a fresh scan (`resolvePeripheral`). It calls `central.connect(...)` with `CBConnectPeripheralOptionNotifyOnDisconnectionKey: true`, then `waitUntilReady(timeout: 18)` polls until both `writeChar` and `notifyChar` are set and notifications are confirmed active (`notifyReady || notifyChar?.isNotifying == true`), followed by a fixed 400ms settle sleep. Only after that does it run the ELM327 init sequence (§2) and publish `.connected(name)`.

**Writing commands**: `sendUnlocked` writes `command + lineEnding` (CR or CRLF depending on `useCRLF`) as ASCII `Data` via `peripheral.writeValue(payload, for: writeChar, type:)`, choosing `.withResponse` vs `.withoutResponse` based on whether the characteristic advertises `.write`. There is no explicit MTU negotiation or write chunking — payloads are written as a single `writeValue` call regardless of BLE MTU.

**Reading responses**: `peripheral(_:didUpdateValueFor:)` accumulates incoming chunks into `responseBuffer` and only resolves the pending continuation once the buffer contains the ELM327 prompt character `>` (comment: "Only the ELM prompt ends a frame — early OK/NO DATA matching caused double-finish races"). There is one in-flight response continuation at a time (`pendingResponse`), guarded further by the `OBDCommandQueue` actor (§3).

**Error / disconnect handling**:
- `centralManagerDidUpdateState`: on any non-`.poweredOn` state, calls `clearConnection()` and publishes `.failed(.bluetoothOff)`.
- `didFailToConnect` and `didDisconnectPeripheral` both check an `ignoreDisconnectCallback` flag (set during intentional teardown/disconnect) to suppress spurious callbacks during planned reconnects; otherwise they call `clearConnection()`, publish `.failed(.notFound)` / `.failed(.disconnected)`, and invoke `onDisconnected?()`. `didDisconnectPeripheral` additionally ignores stale disconnects for a peripheral that has already been replaced.
- Write/read timeouts are per-command (see §3), not connection-level; a command timeout does not itself trigger a BLE disconnect — only actual `CBCentralManagerDelegate` disconnect callbacks do that.
- A code comment states explicitly: "App layer handles reconnect + polling restart. BLE never auto-connects alone" — reconnection policy lives entirely in `OBDService` (§9), not in the transport.

## 2. ELM327 initialization sequence

Two nearly-identical AT sequences exist in the codebase:

- `ELM327Commands.initSequence` — a static array of `(command, delayAfter)` tuples: `ATZ`(1.5s) → `ATE0`(0.2s) → `ATL0`(0.2s) → `ATH0`(0.2s) → `ATAT1`(0.2s) → `ATSP0`(0.5s) → `0100`(0.4s). A comment notes `ATS0` (spaces off) is deliberately omitted because "VLinker MC-iOS / some clones mis-handle spaced replies when disabled early." **This constant is defined but not referenced anywhere else** — it does not appear to be the sequence actually executed.
- The sequence actually invoked on connect lives inline in `BLEOBDTransport.runInitSequence`, called from `connectUnlocked` right after `waitUntilReady` succeeds. It is a "soft init": each step carries its own `(command, timeout, delayAfter, required)` tuple:
  1. `ATZ` (reset) — 5.0s timeout, 1.2s delay after, **not required**
  2. `ATE0` (echo off) — 2.0s timeout, 0.15s delay, **required**
  3. `ATL0` (linefeed off) — 2.0s timeout, 0.1s delay, not required
  4. `ATH0` (headers off) — 2.0s timeout, 0.1s delay, not required
  5. `ATAT1` (adaptive timing) — 2.0s timeout, 0.1s delay, not required
  6. `ATSP0` (auto protocol) — 3.0s timeout, 0.35s delay, not required
  7. `0100` (supported PIDs 01-20) — 4.0s timeout, 0.25s delay, not required

  Each command is retried up to 3 times if `required`, else 2 times, sleeping 250ms between attempts on failure. Only `ATE0` failing all its attempts aborts the connect with `OBDError.timeout`; every other AT command's failure is swallowed and the sequence continues. A comment explicitly states the rationale: "ATZ is heavy on VLinker — one attempt, then continue. 0100 failure must not abort the whole BLE session."

**Response validation**: there is no dedicated "OK"/version-string validator for AT commands. `sendUnlocked` just returns whatever text accumulated before the `>` prompt (§1); `runInitSequence` treats *any* non-throwing return as success — it does not inspect the response body for `OK`, `ELM327 vX.X`, or an error token. The only place that actually parses AT-command output is `ExtendedPIDSession.prepare` (§7), which inspects `ATDPN` output for protocol-number hex digits.

`ELM327Commands.swift` also defines BMW-specific constants used outside the generic init path: `headerDME = "ATSH7E0"`, `protocolCAN11_500 = "ATSP6"`, `bmwOilTempMode22 = "22D3B0"`, consumed by `ExtendedPIDSession` (§7) and `OBDService.runVLinkerProbe` (a debug tool), not by the generic init sequence.

## 3. Command serialization (OBDCommandQueue)

`OBDCommandQueue` is a small `actor` (`BLEOBDTransport.swift`) with a single public method: `func withLock<T>(_ body: () async throws -> T) async throws -> T`.

It maintains a `busy: Bool` flag and an array of `CheckedContinuation<Void, Never>` waiters (FIFO). If `busy`, a caller suspends via `withCheckedContinuation` and is appended to `waiters`; when the current holder's `body()` completes, `defer` sets `busy = false` and resumes the first waiter, if any. `BLEOBDTransport.send` wraps every outbound command in `commandQueue.withLock { sendUnlocked(...) }`, so **exactly one ELM327 command can be in flight at a time**, enforced at the actor level — this is the whole of the "queue."

**API shape**: `send(_:timeout:)` is the only entry point (`OBDTransport.swift:34`); there is no separate enqueue/dequeue/priority API, no command object with metadata (priority, retry policy, PID identity) beyond the raw string and per-call timeout.

**Timeout handling**: per-command, implemented manually with a `Task` that sleeps for `timeout` seconds then resumes the pending continuation with `OBDError.timeout` if it hasn't already been resumed. A `sendGeneration` counter is used to invalidate stale timeout tasks so a late wake-up from a previous command cannot cancel the *next* command's in-flight continuation (comment: "stale wakes were killing the next AT/Mode22 command (~65ms false TIMEOUT)").

**Cancellation**: no explicit per-command cancellation API exists. The closest thing is `teardownForReconnect` and `clearConnection`, which force-resume any pending continuation with `OBDError.disconnected` when a connect/disconnect/teardown happens. Individual `send()` calls cannot be cancelled by the caller except via Swift's structural task cancellation.

**Queueing/prioritization**: **there is no priority concept in `OBDCommandQueue` at all.** It is strict FIFO with mutual exclusion. There is no notion of P0-P5 classes, deadline-based reordering, preemption, or the ability to "jump the queue" for a safety-critical read. Any priority-like behavior that exists lives entirely one layer up, in `OBDService`'s polling loop, and it is coarse:

- `OBDService.pollOnce` (`OBDService.swift:428-526`) buckets PIDs into four fixed-cadence **tiers** re-evaluated every poll cycle: "fast" (RPM/speed, every ≥0.2s), "medium" (coolant/throttle/load/MAP/±oil/±MAF/fuel-rate, every ≥1.0s), "slow" (fuel level/voltage/intake air, every ≥5.0s), "rare" (baro, ambient, trims, catalyst, dist-since-clear, every ≥30.0s). These are hardcoded cadence thresholds, not configurable classes.
  - Coolant (`0x05`) is unconditionally included in the "medium" `due` list regardless of `supportedPIDs` — a hardcoded "always poll this" behavior, functionally similar to but not implemented as a priority tier.
  - Each cycle's PID list is deduplicated and capped to `maxPIDsPerCycle = 6`; overflow is pushed into `deferredPIDs` and drained first on the *next* cycle — a round-robin/backlog mechanism, not a priority scheduler.
  - The poll loop itself runs at a fixed ≥150ms cadence (`beginPolling`, comment: "VLinker BLE drops under aggressive polling — keep ≥150ms cadence").
  - `ExtendedPIDSession.pollDue` applies its own separate tiering (`fast`=0.5s, `medium`=2.0s, `slow`=5.0s, `rare`=30.0s — `VLinkerPIDCatalog.swift:41-46`) and a separate hardcoded per-cycle budget of 2 Mode-22 frames (4 if `forceAll`).

**Comparison to the PRD's P0-P5 scheduler**: nothing resembling a priority-class scheduler exists. There is no command metadata for priority, no preemption of a lower-priority in-flight PID for a higher-priority one, and no unified scheduler across Mode 01 / Mode 22 / DTC / VIN reads — `readDTCs`, `readVIN`, and `readFreezeFrame` all call `transport.send` directly (bypassing `OBDService.pollOnce` entirely) and simply queue behind whatever poll-cycle command is currently in flight via `OBDCommandQueue`'s FIFO lock.

## 4. Response parsing (OBDFrameParser)

`OBDFrameParser.swift` has separate parse paths for Mode 01 (`parse`/`extractDataBytes`), Mode 22 (`parseMode22`/`mode22Payload`), DTCs (`parseDTCResponse`), and VIN (`parseVIN`).

**Handled edge cases (Mode 01 `parse`)**:
- `"UNABLE TO CONNECT"` → `.disconnected`
- `"NO DATA"` → `.noData`
- exact `"?"` (trimmed) → `.badResponse("?")`
- `"STOPPED"`, `"CAN ERROR"`, `"BUFFER FULL"` → `.retry`
- Multi-line responses: `\r` normalized to `\n`, split into lines, each trimmed; empty lines, lines starting with `"SEARCHING"`, the bare prompt `">"`, and lines starting with `"OK"` are filtered out before byte extraction.
- Spaces: `extractDataBytes` first tries a whitespace-tokenized parse (handles both `"41 0C 1A F8"` and 11-bit CAN-ID-prefixed frames like `"7E8 06 41 0C..."`), with a fallback to stripping all non-hex characters and pairing nibbles, including dropping a leading odd nibble (common with concatenated `7E8…` headers).
- 11-bit CAN header tokens (3 hex chars) are specially unpacked into two bytes (hi/lo) rather than misread as data.
- Byte-array search for the response-mode byte `0x41` followed by the expected PID before slicing out `byteCount` data bytes, so it tolerates leading garbage/headers before the actual `41 <PID>` marker.
- `parseMode22` additionally strips ISO-TP line-index prefixes like `"0:"`, `"1:"`, `"014:"` (comment: "Strip ISO-TP continuum prefixes"), and has a fallback continuous-hex scan trying both an even and an odd starting offset if tokenized parsing fails to find `62 <DID_HI> <DID_LO>` — but it only ever returns the payload from a single located `62 DID` marker, it does not reconstruct/reassemble a full ISO-TP multi-frame sequence.
- `parseVIN` explicitly drops "leading length nibble lines like `014`" and looks for the `49 02 01` prefix pattern before extracting ASCII payload bytes, tolerating vin lengths ≥17 by truncating to 17.
- `parseDTCResponse` skips the mode-echo byte (`0x43`/`0x47`/`0x4A` for stored/pending/permanent) if found, and skips `00 00` DTC pairs (padding).

**Gaps / not handled (stated plainly)**:
- No handling of adapter "echo" of the sent command itself — the init sequence disables echo via `ATE0`, but if echo is *not* successfully disabled (an optional, non-required step in `runInitSequence`, §2), `OBDFrameParser` has no code path that strips an echoed command line before parsing; it is not in the filtered-line list (`"SEARCHING"`, `">"`, `"OK"` only).
- No true ISO-TP multi-frame reconstruction: no handling of PCI nibbles (`0x1_` first frame length, `0x2_` consecutive frame index) or of sending flow-control (`0x30`) continuation frames; the parser assumes the ELM327/VLinker adapter has already reassembled the full multi-line payload into the text buffer it hands back.
- `"CAN ERROR"` and `"BUFFER FULL"` are mapped to `.retry`, but the caller (`OBDService.queryPIDBytes`) only retries the *same command* up to 2 times total and gives up silently (`return nil`) — there's no distinct handling between a soft bus glitch and a hard adapter fault.
- No handling of ELM327's `"UNABLE TO CONNECT"` vs a genuinely different protocol mismatch message, nor of `"NO DATA"` combined with a partial byte payload in the same buffer.
- No CRC/checksum validation of received bytes, nor a sanity check like "byte count matches PCI length field."
- `parse`'s final fallback (`.badResponse(response)`) returns the *entire raw response* as the error payload rather than a structured diagnostic, making programmatic handling of "why did this fail" reliant on string matching upstream.
- Case sensitivity is handled by uppercasing (`.uppercased()`), but no handling of adapters that send lowercase/mixed hex with unexpected delimiters (e.g., commas) is present.

## 5. PID catalog & polling loop

`OBDPIDCatalog` (`OBDPID.swift:20-162`) is a static, hardcoded array (`all`) of 28 `OBDPID` structs, each carrying `mode` (always `0x01` here), `pid`, `byteCount`, a `key` string, and a `parse: ([UInt8]) -> Double?` closure implementing the SAE J1979 formula for that PID (e.g. `trim`, `pct`, `temp` helpers, plus PID-specific closures like RPM's `(A*256+B)/4`). `OBDPIDCatalog.apply` is a second hardcoded `switch` mapping each `pid` byte to a specific `VehicleSnapshot` field — i.e., the PID→struct-field mapping is duplicated as a switch statement separate from the catalog array itself (there's no data-driven single source of truth linking `OBDPID.key` to a `VehicleSnapshot` keypath). None of this is externally configurable (no plist/JSON catalog, no runtime PID registration) — adding a PID requires a code change to both `all` and `apply`.

`OBDPIDCatalog.parseSupportedBitmask` decodes the standard Mode 01 `0100`/`0120`/`0140` supported-PID bitmask response into a `Set<UInt8>` of PID numbers.

**Polling decision logic** lives in `OBDService.pollOnce`: four hardcoded time-since-last-poll thresholds (0.2s / 1.0s / 5.0s / 30.0s) select which PIDs are "due" each cycle, subject to `supportedPIDs.contains(pid)` gating (populated once at session start from the `0100`/`0120`/`0140` bitmask query in `beginPolling`, with an "always keep core live PIDs" override for `0x0C`/`0x0D`/`0x05`, and a fallback to *all* catalog PIDs if the bitmask query returned ≤1 supported PID — i.e., if PID discovery effectively fails, the service just assumes every PID is supported and lets per-poll `NO DATA` responses silently no-op). The `maxPIDsPerCycle = 6` budget and `deferredPIDs` backlog round out the polling cadence logic. All thresholds, tier composition, and budget size are Swift constants — **none are exposed as user/runtime configuration**.

## 6. VIN reading and DTC read/clear

**VIN**: `OBDService.readVIN()` sends the fixed command `"0902"` with a 3s timeout and parses via `OBDFrameParser.parseVIN` (§4); on parse failure it throws `OBDError.badResponse(response)`. `VINDecoder.swift` is a pure decode/validate utility, not a transport consumer — `decode(_:)` extracts WMI, plant code, serial, and model year (via a hardcoded `yearTable` and `wmiTable` covering ~24 manufacturer prefixes including BMW variants `WBA`/`WBS`/`WBY`) and computes `isCheckDigitValid` via the standard ISO 3779 transliteration/weight table.

**DTC read**: `DTCService.readDTCs()` issues Mode 03 (stored), Mode 07 (pending), Mode 0A (permanent) sequentially (each wrapped in `try? await` so one mode's failure doesn't abort the others), parses each via `OBDFrameParser.parseDTCResponse`, and merges by code with a priority order (permanent > stored > pending) if the same code appears from multiple modes. Each returned `DTC` is enriched from a bundled `DTCCatalog.json` resource for `descriptionKey`/`summary`/`severity`, localized via a hand-rolled language check (`en/tr`) rather than the standard iOS localization pipeline. `DTCMonitor` layers a background polling loop on top: it waits 8s after start, then loops calling `scanIfNeeded()` at an interval that adapts to current RPM/speed (`nextIntervalSeconds`: 20s if RPM≥5000 or speed≥140, 35s if RPM≥3500 or speed≥100, else 75s) — this is the one place in the codebase with genuinely adaptive-to-driving-conditions cadence, though it is DTC-scan-specific, not a general request scheduler. It diffs newly-seen vs. cleared codes against SwiftData (`DTCRecord`, `persistAndDiff`) and fires `alertEngine.notifyNewDTCs(fresh)` for genuinely new codes.

**DTC clear**: `DTCService.clearDTCs()` is three lines — it sends `ELM327Commands.clearDTCs` (`"04"`) with a 3s timeout and returns. **There is no confirmation step, no "are you sure" gate, no pre-clear freeze-frame snapshot, no check of engine-running state, and no distinction between a user-initiated clear and any other caller at this layer.** `OBDService.clearDTCs()` is a direct passthrough with no additional guard. Any confirmation UX, if it exists, would have to live in a SwiftUI view not covered by the Core/OBD layer — nothing here enforces one. (The PRD §35 requires a confirmation step before Mode 04; this is a concrete gap to close in a later phase.)

## 7. VLinker / BMW Mode-22 extension

`ExtendedPIDSession` (`ExtendedPIDSession.swift`) and `VLinkerPIDCatalog` (`VLinkerPIDCatalog.swift`) implement a BMW-specific Mode 22 (UDS `ReadDataByIdentifier`) layer that is **interleaved with, not cleanly separated from, the generic Mode 01 polling flow** — it shares the same `OBDTransport`/`OBDCommandQueue` and mutates shared ELM327 session state (header, protocol) that the generic path also depends on:

- `OBDService.pollOnce` calls `extendedPIDs.pollDue(...)` only after a fresh Mode 01 read succeeded this cycle (`mode01Fresh`, set when PID `0x0C`/`0x0D`/`0x05` was just read; comment: "Do NOT run Mode 22 before Mode 01 is proven... early ATSH7E0/Mode22 can leave the bus unusable for live PIDs") and only when `settings.vehiclePlatform != .universal`. This is a hard sequencing dependency between the "generic" and "BMW extension" layers, not an independent subsystem.
- `ExtendedPIDSession.prepare` actively mutates adapter-global session state shared with the generic path: it may re-send `ATSP6` (force CAN 500k protocol), `ATAL`, `ATE0`, `ATH0`, `ATAR`, `ATSTFF`, and — critically — `ATSH<header>` to change the ECU target header away from the default functional broadcast (`7DF`) to `7E0` (DME physical)/`7E1` (EGS)/`6F1` (gateway) depending on which PID is being read. After each Mode-22 poll pass, `restoreFunctionalHeader` sends `ATSH7DF` again so Mode 01 reads on the next cycle target the functional address — i.e. the two subsystems **share and hand off a single mutable ELM327 header/protocol state machine** rather than each operating in isolation.
- `ExtendedPIDSession.discover` is a probe run whenever `active` PIDs are empty and re-discovery is due (every ≥12s): it tries an ordered list of oil-temp DID candidates (`bmw.oilTemp.4402` before `bmw.oilTemp.D3B0` — comment: "Prefer working 4402 on this N13; D3B0 often returns only 7F2222") and, only if one succeeds, probes the remaining catalog PIDs one at a time and keeps them "active" even if they return `NO DATA` on the probe.
- `VLinkerPIDCatalog` defines 20 BMW Mode-22 DIDs (`bmwExtended`) gated by `VehiclePlatform` (`.bmwF30N13`/`.bmwFSeries`), each with its own tier (`fast`/`medium`/`slow`/`rare` — a **separate** tiering enum, `VLinkerPollTier`, from `OBDService`'s inline thresholds) and its own decode closure. It also separately documents the 20 "standard" Mode 01 metrics with the same tier labels (`standardMode01Metrics`) purely as metadata/notes — this array is not consumed by `OBDService`'s actual polling logic (which hardcodes its own PID lists inline, §5), so it currently functions as documentation rather than executable config.
- Per-cycle Mode-22 traffic is separately budgeted (2 frames/cycle, 4 if `forceAll`) independent of `OBDService`'s own `maxPIDsPerCycle = 6` Mode-01 budget — the two budgets are not unified, so total per-cycle BLE traffic is the *sum* of both subsystems' independently-tuned limits.
- `OBDService.runVLinkerProbe()` is a one-shot debug/probe routine fired 2.5s after each `beginPolling()` that sends a hardcoded sequence of AT + Mode01 + Mode22 commands (`ATI`, `STI`, `ATDP`, `ATDPN`, `ATH1`, `ATSH7DF`, `0100`, `ATH0`, `010C`, `0105`, `1003`, `224402`, `22D3B0`, `222C10`, header-swap to `7E1`, `1003`, `221E01`, back to `7DF`, `010C`) purely for Settings-screen/console diagnostics, persisted to a `vlinker_probe.txt` file in the Documents directory and logged via `NSLog`. This probe itself also goes through the same `OBDCommandQueue`/`transport.send` path and thus competes with live polling for the single command slot.

**Summary**: the VLinker/BMW extension is architecturally bolted onto the generic Mode 01 flow — same transport, same command queue, shared and actively toggled ELM327 session state (header, protocol), and sequencing dependent on the generic layer succeeding first each cycle. It is not a separable module today; disabling it cleanly would require touching `OBDService.pollOnce`'s control flow, not just omitting a call. This is the concrete example the PRD's §103 "OEM provider" architecture is meant to replace.

## 8. Mock/Simulator transport

`MockOBDTransport` implements the full `OBDTransport` protocol against a synthetic 300-second cyclic drive profile (`profile(at:)`) covering: cold start (0-5s, RPM/voltage ramp), idle (5-20s), acceleration (20-60s), cruise (60-120s), stop (120-140s), harsh braking (140-145s, "-3.4 m/s²"), highway acceleration (145-185s), highway cruise (185-265s), deceleration (265-292s), and park (292-300s). It answers `01xx` PID queries by looking up `OBDPIDCatalog.pid(pid)` and encoding the profile's simulated value for that PID, plus hardcoded canned responses for `0100`/`0120`/`0140`/`0160` (supported-PID bitmasks), `0900`/`0902` (VIN service + a real multi-line ISO-TP-style VIN response), Mode 03/07/04 DTC commands (`43 01 33 00 00`, `47 00`, `44` — static "one code, no pending" responses), and several BMW Mode-22 DIDs (`22D3B0`, `224402`, `222C10`/`222C11`, `222B0D`, `22586F`) computed from the live simulated oil temperature/MAP/RPM. All `AT*` commands unconditionally return `"OK"`.

**What it does simulate**: a full healthy-vehicle drive cycle with time-varying values, a fixed/static DTC set (one stored code `0133`), and BMW-specific oil temp/pressure/boost Mode-22 answers consistent with the drive profile. It deliberately simulates the *absence* of the standard Mode 01 oil-temp PID (`pid == 0x5C { return "NO DATA" }`, comment: "Simulate BMW: no Mode 01 oil temp PID") to mirror real BMW ECU behavior forcing the Mode-22 path.

**What it does NOT simulate** (gaps relative to the PRD's "Simulator Mode" vision, §149):
- No fault-code variability — the DTC set is a single hardcoded response, not configurable/scriptable to simulate new codes appearing, clearing, or pending→stored transitions during a session.
- No simulated BLE disconnects, dropped packets, partial/garbled frames, or link instability — `send()` either succeeds deterministically or throws `OBDError.disconnected` only if `connected == false`; there's no probabilistic or scripted failure injection.
- No simulated slow/variable adapter latency — responses return effectively immediately (aside from a few fixed short sleeps during connect/scan); there is no jitter, no configurable per-command delay, and no way to model a slow/degraded adapter.
- No simulated malformed/edge-case ELM327 text (no spaces variant, no echo-on variant, no `"STOPPED"`/`"CAN ERROR"`/`"BUFFER FULL"` scenarios, no `"?"` unsupported-command responses) — every code path in `OBDFrameParser`'s error branches (§4) is effectively untested by this mock.
- No multi-vehicle-platform variability beyond hardcoded BMW F30/N13 constants; `VehiclePlatform.universal` vs `.bmwF30N13` selection isn't reflected in what the mock transport itself returns (it always answers the BMW Mode-22 DIDs listed above regardless of the app's selected platform setting).
- Unsupported/out-of-catalog PIDs return `"?"` deterministically rather than varying by simulated adapter/vehicle behavior.

In short: `MockOBDTransport` today is a **happy-path, single-scenario drive-cycle simulator** for UI/gauge development and fuel-calculation testing — it is not built to exercise transport-layer failure handling, adapter diversity, or DTC-lifecycle testing.

## 9. Known gaps vs. the PRD's target architecture

Stated plainly, without recommending fixes:

- **Transport-agnostic session layer**: does not exist. `OBDService` holds direct references to `BLEOBDTransport`/`MockOBDTransport` concrete types (in addition to the `OBDTransport` protocol reference), and BMW-Mode-22-specific behavior (`ExtendedPIDSession`) is wired directly into `OBDService.pollOnce`'s control flow rather than sitting behind a transport-neutral session abstraction. There is no session object separate from `OBDService` itself that could be reused across a hypothetical Wi-Fi or USB transport.
- **Adapter capability probing**: no formal capability negotiation exists. Adapter identity/version is only ever queried ad hoc inside the debug-only `runVLinkerProbe()` (`ATI`, `STI`, `ATDP`, `ATDPN`), and its output is logged/persisted to a text file for humans to read, not parsed into a capability model that changes runtime behavior. Characteristic priority selection in `BLEOBDTransport` (§1) is the closest thing to capability detection, and it only covers which BLE characteristic to use, not ELM/STN chipset feature negotiation.
- **Replay transport**: does not exist. There is no `OBDTransport` implementation that replays a recorded session/log file — only live `BLEOBDTransport` and synthetic `MockOBDTransport` (§8) are present.
- **ISO-TP / multi-frame CAN reconstruction**: does not exist as a proper protocol state machine. `OBDFrameParser` (§4) parses whatever text the ELM327 firmware itself has already assembled from the underlying CAN frames — it does not implement PCI-byte-level single/first/consecutive/flow-control frame handling itself, and does not send flow-control frames. All multi-frame handling is delegated to the adapter's firmware.
- **Adaptive polling based on measured latency**: does not exist for the main telemetry polling loop. All cadences in `OBDService.pollOnce` (0.2s/1.0s/5.0s/30.0s, §5) and in `ExtendedPIDSession.pollDue` (0.5s/2.0s/5.0s/30.0s, §7) are fixed constants regardless of actual observed round-trip time; the fixed 150ms inter-cycle sleep is a static "known-safe for VLinker" value chosen by prior tuning, not a measured/adaptive one. The one place with any measurement-driven adaptivity in the whole file set is `DTCMonitor.nextIntervalSeconds`, and that adapts to vehicle RPM/speed, not to BLE/adapter latency.
- **Priority-class command scheduling (P0-P5)**: as detailed in §3, does not exist. `OBDCommandQueue` is unconditional FIFO mutual exclusion; there is no priority field anywhere in the `send()` call signature, no preemption, and DTC/VIN/freeze-frame reads share the exact same undifferentiated queue as routine telemetry polling.
- **Command metadata / structured request objects**: `send(_ command: String, timeout: TimeInterval)` is a bare string + timeout; there is no `OBDRequest` type carrying priority, PID identity, retry policy, or expected-response-shape metadata that a scheduler could reason about.

This is the concrete gap list Phase 1 (§241, "Transport Foundation") will need to work through — `DiagnosticSession`, an `AdapterCapabilities` model, a real priority scheduler, and a `ReplayTransport` are the biggest missing pieces relative to the target architecture.
