import { create } from "zustand";
import { useAppSettings } from "../settings/appSettings";
import { BLEOBDTransport } from "./transports/bleTransport";
import { MockOBDTransport } from "./transports/mockTransport";
import type { ConnectionState, DiscoveredDevice, OBDTransport } from "./obdTransport";
import * as OBDFrameParser from "./obdFrameParser";
import { allPIDs, applyPidValue, parseSupportedBitmask } from "./obdPid";
import { ELM327Commands, initSequence } from "./elm327Commands";
import { parseReadiness, type ReadinessStatus } from "./readiness";
import {
  extractFreezeFrameBytes,
  freezeFrameCommand,
  hasAnyValue,
  FREEZE_FRAME_PIDS,
  type FreezeFrameValues,
} from "./freezeFrame";
import { emptySnapshot, type VehicleSnapshot } from "./vehicleSnapshot";

interface OBDServiceState {
  transport: OBDTransport;
  connection: ConnectionState;
  snapshot: VehicleSnapshot;
  supportedPIDs: Set<number>;
  devices: DiscoveredDevice[];
  isPolling: boolean;
  /** Set when the user disconnects on purpose, so the reconnect loop stands down until
   * they ask for a connection again. */
  autoConnectSuppressed: boolean;

  useMockTransport: (useMock: boolean) => void;
  scan: () => Promise<void>;
  stopScan: () => void;
  connect: (deviceId: string) => Promise<void>;
  /** Connects to the remembered adapter, falling back to a scan. Safe to call repeatedly. */
  autoConnect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => void;
  readVIN: () => Promise<string | undefined>;
  /** Mode 01 PID 01 — emissions monitor readiness. */
  readReadiness: () => Promise<ReadinessStatus | undefined>;
  /** Mode 02 — the ECU's snapshot from when the fault set, not live values. */
  readFreezeFrame: () => Promise<FreezeFrameValues | undefined>;
}

let pollHandle: ReturnType<typeof setTimeout> | undefined;
let unsubscribeState: (() => void) | undefined;

async function runInitSequence(transport: OBDTransport) {
  for (const step of initSequence) {
    await transport.writeAndRead(step.command, 3000).catch(() => undefined);
    await new Promise((r) => setTimeout(r, step.delayAfterMs));
  }
}

// Real ELM327/BLE round-trips are far too slow (often 100-300ms each) to query every
// supported PID sequentially and still keep speed/RPM fresh enough for trip-distance
// integration (FuelIntegrationState drops any gap >= 10s). So — matching the tiered
// scheduler in the Swift original (OBDService.pollOnce) — only a small, capped set of
// PIDs is queried per cycle: the fast tier (speed/RPM/fuel-rate) every cycle, others on
// slower cadences, with overflow deferred to the next cycle rather than ever skipped.
const FAST_PIDS = [0x0c, 0x0d, 0x5e, 0x10, 0x0b, 0x0f]; // rpm, speed, fuelRate, maf, map, intakeAir
const MEDIUM_PIDS = [0x05, 0x11, 0x04, 0x2f, 0x42]; // coolant, throttle, engineLoad, fuelLevel, voltage
const SLOW_PIDS = [0x33, 0x46, 0x5c, 0x49, 0x0e, 0x3c]; // baro, ambient, oilTemp, pedal, timing, catalyst
const RARE_PIDS = [0x06, 0x07, 0x08, 0x09, 0x0a, 0x23, 0x1f, 0x21, 0x31, 0x2c, 0x45];

const FAST_INTERVAL_MS = 200;
const MEDIUM_INTERVAL_MS = 1000;
const SLOW_INTERVAL_MS = 5000;
const RARE_INTERVAL_MS = 30_000;
const MAX_PIDS_PER_CYCLE = 6;

let lastFastAt = 0;
let lastMediumAt = 0;
let lastSlowAt = 0;
let lastRareAt = 0;
let deferredPIDs: number[] = [];

export function resetPollScheduler() {
  lastFastAt = 0;
  lastMediumAt = 0;
  lastSlowAt = 0;
  lastRareAt = 0;
  deferredPIDs = [];
}

export function duePIDs(now: number, forceAll: boolean, supported: Set<number>): number[] {
  const due: number[] = [...deferredPIDs];
  deferredPIDs = [];

  const supportsFilter = (pid: number) => supported.size === 0 || supported.has(pid);

  if (forceAll || now - lastFastAt >= FAST_INTERVAL_MS) {
    due.push(...FAST_PIDS.filter(supportsFilter));
    lastFastAt = now;
  }
  if (forceAll || now - lastMediumAt >= MEDIUM_INTERVAL_MS) {
    due.push(...MEDIUM_PIDS.filter(supportsFilter));
    lastMediumAt = now;
  }
  if (forceAll || now - lastSlowAt >= SLOW_INTERVAL_MS) {
    due.push(...SLOW_PIDS.filter(supportsFilter));
    lastSlowAt = now;
  }
  if (forceAll || now - lastRareAt >= RARE_INTERVAL_MS) {
    due.push(...RARE_PIDS.filter(supportsFilter));
    lastRareAt = now;
  }

  const seen = new Set<number>();
  return due.filter((pid) => (seen.has(pid) ? false : (seen.add(pid), true)));
}

async function pollOnce(
  transport: OBDTransport,
  supported: Set<number>,
  forceAll: boolean
): Promise<Partial<VehicleSnapshot>> {
  const patch: VehicleSnapshot = emptySnapshot();
  const due = duePIDs(Date.now(), forceAll, supported);
  const queue = due.slice(0, MAX_PIDS_PER_CYCLE);
  deferredPIDs.push(...due.slice(MAX_PIDS_PER_CYCLE));

  for (const pidNum of queue) {
    const def = allPIDs.find((p) => p.pid === pidNum);
    if (!def) continue;
    try {
      const raw = await transport.writeAndRead(ELM327Commands.mode01(def.pid), 2000);
      const result = OBDFrameParser.parse(raw, def.pid, def.byteCount, ELM327Commands.mode01(def.pid));
      if (result.kind === "value") {
        const value = def.parse(result.bytes);
        if (value != null) applyPidValue(value, def.pid, patch);
      }
    } catch {
      // skip this PID this cycle
    }
  }
  return patch;
}

export const useOBDStore = create<OBDServiceState>((set, get) => ({
  transport: new MockOBDTransport(),
  connection: { status: "idle" },
  snapshot: emptySnapshot(),
  supportedPIDs: new Set(),
  devices: [],
  isPolling: false,
  autoConnectSuppressed: false,

  useMockTransport: (useMock: boolean) => {
    get().stop();
    const transport = useMock ? new MockOBDTransport() : new BLEOBDTransport();
    unsubscribeState?.();
    unsubscribeState = transport.onStateChange((connection) => set({ connection }));
    set({ transport, connection: transport.state, devices: [] });
  },

  scan: async () => {
    set({ devices: [] });
    await get().transport.scan((device) => {
      set((s) => (s.devices.some((d) => d.id === device.id) ? s : { devices: [...s.devices, device] }));
    });
  },

  stopScan: () => get().transport.stopScan(),

  autoConnect: async () => {
    const settings = useAppSettings.getState();
    const { transport } = get();
    if (transport.state.status === "connected") return true;
    if (transport.state.status === "connecting") return false;
    // Reaching here means someone actively wants a connection — the reconnect loop
    // checks `autoConnectSuppressed` before calling, and a UI tap overrides it.
    set({ autoConnectSuppressed: false });

    const remembered = settings.lastAdapterId;
    if (remembered) {
      // Direct connect skips the 15s scan entirely — much faster and far more reliable
      // than scanning and hoping the adapter advertises in time.
      const ready = (await transport.prepareForDirectConnect?.()) ?? true;
      if (!ready) return false;
      try {
        await get().connect(remembered);
        return true;
      } catch {
        // Adapter out of range or its MAC rotated — fall through to a scan.
      }
    }

    await get().scan();
    const devices = get().devices;
    const target = devices.find((d) => d.id === remembered) ?? devices[0];
    if (!target) return false;
    try {
      await get().connect(target.id);
      return true;
    } catch {
      return false;
    }
  },

  connect: async (deviceId: string) => {
    const { transport } = get();
    set({ autoConnectSuppressed: false });
    await transport.connect(deviceId);
    // Remember the adapter only once the link is actually up, so a failed attempt
    // never overwrites a known-good id — and never remember the simulated adapter.
    if (transport.isRealAdapter) {
      const settings = useAppSettings.getState();
      settings.set("lastAdapterId", deviceId);
      const name = transport.state.status === "connected" ? transport.state.deviceName ?? null : null;
      if (name) settings.set("lastAdapterName", name);
    }

    await runInitSequence(transport);

    const pages: Array<{ command: string; pid: number; base: number }> = [
      { command: ELM327Commands.supportedPIDs00, pid: 0x00, base: 0x00 },
      { command: ELM327Commands.supportedPIDs20, pid: 0x20, base: 0x20 },
      { command: ELM327Commands.supportedPIDs40, pid: 0x40, base: 0x40 },
    ];
    const merged = new Set<number>();
    for (const page of pages) {
      try {
        const raw = await transport.writeAndRead(page.command, 2000);
        const result = OBDFrameParser.parse(raw, page.pid, 4, page.command);
        if (result.kind === "value") {
          for (const pid of parseSupportedBitmask(result.bytes, page.base)) merged.add(pid);
        } else {
          break; // adapter/vehicle didn't answer this page — later pages won't either
        }
      } catch {
        break;
      }
    }
    set({ supportedPIDs: merged });
    resetPollScheduler();
    get().start();
  },

  disconnect: async () => {
    set({ autoConnectSuppressed: true });
    get().stop();
    await get().transport.disconnect();
  },

  start: async () => {
    if (get().isPolling) return;
    set({ isPolling: true });
    let first = true;
    const loop = async () => {
      if (!get().isPolling) return;
      const { transport, supportedPIDs } = get();
      if (transport.state.status === "connected") {
        const patch = await pollOnce(transport, supportedPIDs, first);
        first = false;
        set((s) => ({ snapshot: { ...s.snapshot, ...patch, timestamp: Date.now() } }));
      }
      pollHandle = setTimeout(loop, FAST_INTERVAL_MS);
    };
    loop();
  },

  stop: () => {
    set({ isPolling: false });
    if (pollHandle) clearTimeout(pollHandle);
    pollHandle = undefined;
  },

  readVIN: async () => {
    const { transport } = get();
    try {
      const raw = await transport.writeAndRead("0902", 4000);
      return OBDFrameParser.parseVIN(raw);
    } catch {
      return undefined;
    }
  },

  readReadiness: async () => {
    const { transport } = get();
    try {
      const command = ELM327Commands.mode01(0x01);
      const raw = await transport.writeAndRead(command, 3000);
      const result = OBDFrameParser.parse(raw, 0x01, 4, command);
      return result.kind === "value" ? parseReadiness(result.bytes) : undefined;
    } catch {
      return undefined;
    }
  },

  readFreezeFrame: async () => {
    const { transport } = get();
    const values: FreezeFrameValues = {};
    for (const entry of FREEZE_FRAME_PIDS) {
      try {
        const raw = await transport.writeAndRead(freezeFrameCommand(entry.pid), 2500);
        const bytes = extractFreezeFrameBytes(raw, entry.pid, entry.byteCount);
        if (bytes) entry.apply(bytes, values);
      } catch {
        // One unsupported PID must not abandon the rest of the frame.
      }
    }
    return hasAnyValue(values) ? values : undefined;
  },
}));
