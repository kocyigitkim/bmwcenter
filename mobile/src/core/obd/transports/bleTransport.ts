import { BleManager, Device, Characteristic, State, Subscription } from "react-native-ble-plx";
import { Buffer } from "buffer";
import { PermissionsAndroid, Platform } from "react-native";
import type { ConnectionState, DiscoveredDevice, OBDTransport } from "../obdTransport";

/** Android requires these to be granted at runtime, even though they're declared in the manifest. */
async function ensureAndroidBlePermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;

  const permissions =
    Platform.Version >= 31
      ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

  const results = await PermissionsAndroid.requestMultiple(permissions);
  return permissions.every((p) => results[p] === PermissionsAndroid.RESULTS.GRANTED);
}

/** Vgate / VLinker MC-iOS proprietary serial service, plus common ELM327-clone serial services. */
const SERVICE_CANDIDATES = [
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "0000fff0-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "000018f0-0000-1000-8000-00805f9b34fb",
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
];
const NORDIC_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const NORDIC_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

const NAME_FILTER = [
  "OBD",
  "ELM",
  "VGATE",
  "VLINKER",
  "V-LINKER",
  "VEEPEAK",
  "ICAR",
  "MC-IOS",
  "MC+",
  "IOS-VLINK",
  "IOS-VLINKER",
  "VLINK",
];

/** Single-flight command queue: only one in-flight AT/OBD command at a time. */
class CommandQueue {
  private busy = false;
  private waiters: Array<() => void> = [];

  async withLock<T>(body: () => Promise<T>): Promise<T> {
    while (this.busy) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.busy = true;
    try {
      return await body();
    } finally {
      this.busy = false;
      const next = this.waiters.shift();
      next?.();
    }
  }
}

export class BLEOBDTransport implements OBDTransport {
  private manager = new BleManager();
  private device: Device | undefined;
  private writeChar: Characteristic | undefined;
  private notifySub: Subscription | undefined;
  private responseBuffer = "";
  private pendingResolve: ((value: string) => void) | undefined;
  private pendingReject: ((err: Error) => void) | undefined;
  private timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  private queue = new CommandQueue();

  private _state: ConnectionState = { status: "idle" };
  private stateListeners = new Set<(s: ConnectionState) => void>();
  private lineListeners = new Set<(l: string) => void>();

  get state(): ConnectionState {
    return this._state;
  }

  private setState(state: ConnectionState) {
    this._state = state;
    this.stateListeners.forEach((l) => l(state));
  }

  onStateChange(listener: (state: ConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onLine(listener: (line: string) => void): () => void {
    this.lineListeners.add(listener);
    return () => this.lineListeners.delete(listener);
  }

  private async waitUntilPoweredOn(timeoutMs = 10000): Promise<boolean> {
    const start = Date.now();
    let current = await this.manager.state();
    while (Date.now() - start < timeoutMs) {
      if (current === State.PoweredOn) return true;
      if (current === State.Unauthorized || current === State.Unsupported) return false;
      await new Promise((r) => setTimeout(r, 200));
      current = await this.manager.state();
    }
    return current === State.PoweredOn;
  }

  async scan(onDevice: (device: DiscoveredDevice) => void, timeoutMs = 15000): Promise<void> {
    this.setState({ status: "scanning" });
    const granted = await ensureAndroidBlePermissions();
    if (!granted) {
      this.setState({ status: "error", message: "bluetooth_permission_denied" });
      return;
    }
    const poweredOn = await this.waitUntilPoweredOn();
    if (!poweredOn) {
      this.setState({ status: "error", message: "bluetooth_off" });
      return;
    }
    const seen = new Set<string>();
    this.manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) {
        this.setState({ status: "error", message: error.message });
        return;
      }
      if (!device) return;
      const name = device.name ?? device.localName ?? "";
      const matches = NAME_FILTER.some((f) => name.toUpperCase().includes(f));
      if (!matches || seen.has(device.id)) return;
      seen.add(device.id);
      onDevice({ id: device.id, name: device.name ?? device.localName ?? null, rssi: device.rssi ?? null });
    });
    await new Promise((r) => setTimeout(r, timeoutMs));
    this.stopScan();
  }

  stopScan(): void {
    this.manager.stopDeviceScan();
    if (this._state.status === "scanning") this.setState({ status: "idle" });
  }

  async connect(deviceId: string): Promise<void> {
    this.stopScan();
    this.setState({ status: "connecting" });
    try {
      let device = await this.manager.connectToDevice(deviceId, { autoConnect: false, timeout: 15000 });
      device = await device.discoverAllServicesAndCharacteristics();
      this.device = device;

      const services = await device.services();
      let writeChar: Characteristic | undefined;
      let notifyChar: Characteristic | undefined;

      for (const service of services) {
        const svcUuid = service.uuid.toLowerCase();
        const isCandidate = SERVICE_CANDIDATES.includes(svcUuid);
        const chars = await service.characteristics();
        for (const char of chars) {
          const cUuid = char.uuid.toLowerCase();
          if (isCandidate && cUuid === NORDIC_RX) writeChar = char;
          if (isCandidate && cUuid === NORDIC_TX) notifyChar = char;
          if (!writeChar && (char.isWritableWithResponse || char.isWritableWithoutResponse)) writeChar = char;
          if (!notifyChar && char.isNotifiable) notifyChar = char;
        }
        if (writeChar && notifyChar) break;
      }

      if (!writeChar || !notifyChar) {
        throw new Error("No compatible OBD serial characteristics found on this device");
      }
      this.writeChar = writeChar;

      this.notifySub = notifyChar.monitor((error, characteristic) => {
        if (error) return;
        const value = characteristic?.value;
        if (!value) return;
        const chunk = Buffer.from(value, "base64").toString("ascii");
        this.handleIncoming(chunk);
      });

      device.onDisconnected(() => {
        this.rejectPending(new Error("Device disconnected"));
        this.setState({ status: "disconnected" });
      });

      this.setState({ status: "connected", deviceName: device.name ?? undefined });
    } catch (err) {
      this.setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.notifySub?.remove();
    this.notifySub = undefined;
    if (this.device) {
      await this.manager.cancelDeviceConnection(this.device.id).catch(() => undefined);
    }
    this.device = undefined;
    this.writeChar = undefined;
    this.rejectPending(new Error("Disconnected"));
    this.setState({ status: "disconnected" });
  }

  private rejectPending(err: Error) {
    if (this.timeoutHandle) clearTimeout(this.timeoutHandle);
    this.pendingReject?.(err);
    this.pendingResolve = undefined;
    this.pendingReject = undefined;
  }

  private handleIncoming(chunk: string) {
    this.responseBuffer += chunk;
    this.lineListeners.forEach((l) => l(chunk));
    if (this.responseBuffer.includes(">")) {
      const complete = this.responseBuffer;
      this.responseBuffer = "";
      if (this.timeoutHandle) clearTimeout(this.timeoutHandle);
      this.pendingResolve?.(complete);
      this.pendingResolve = undefined;
      this.pendingReject = undefined;
    }
  }

  async write(command: string): Promise<void> {
    if (!this.writeChar) throw new Error("Not connected");
    const payload = Buffer.from(`${command}\r`, "ascii").toString("base64");
    if (this.writeChar.isWritableWithResponse) {
      await this.writeChar.writeWithResponse(payload);
    } else {
      await this.writeChar.writeWithoutResponse(payload);
    }
  }

  async writeAndRead(command: string, timeoutMs = 4000): Promise<string> {
    return this.queue.withLock(async () => {
      this.responseBuffer = "";
      const result = new Promise<string>((resolve, reject) => {
        this.pendingResolve = resolve;
        this.pendingReject = reject;
        this.timeoutHandle = setTimeout(() => {
          this.pendingResolve = undefined;
          this.pendingReject = undefined;
          reject(new Error(`Timed out waiting for response to ${command}`));
        }, timeoutMs);
      });
      await this.write(command);
      return result;
    });
  }
}
