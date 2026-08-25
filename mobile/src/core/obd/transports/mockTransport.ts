import { Buffer } from "buffer";
import type { ConnectionState, DiscoveredDevice, OBDTransport } from "../obdTransport";

function buildSupportedBitmask(pids: number[], base: number): string {
  const bytes = [0, 0, 0, 0];
  for (const pid of pids) {
    const rel = pid - base - 1;
    if (rel < 0 || rel >= 32) continue;
    const i = Math.floor(rel / 8);
    const bit = rel % 8;
    bytes[i] = (bytes[i] ?? 0) | (0x80 >> bit);
  }
  return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

/** PIDs this mock adapter actually answers with plausible data — kept in sync with the
 * `switch` in `simulate()` below so the reported "supported PIDs" bitmask matches reality. */
const PAGE0_PIDS = [0x04, 0x05, 0x0c, 0x0d, 0x0f, 0x11]; // engineLoad, coolant, rpm, speed, intakeAir, throttle
const PAGE1_PIDS = [0x2f]; // fuelLevel
const PAGE2_PIDS = [0x42, 0x46, 0x49, 0x5c, 0x5e]; // voltage, ambient, pedal, oilTemp, fuelRate

/**
 * Simulated adapter for development on the iOS Simulator / Android Emulator, where
 * no physical Bluetooth OBD dongle is available. Generates plausible live values so
 * every dashboard/fuel/trip screen can be exercised end-to-end without hardware.
 */
export class MockOBDTransport implements OBDTransport {
  private _state: ConnectionState = { status: "idle" };
  private stateListeners = new Set<(s: ConnectionState) => void>();
  private lineListeners = new Set<(l: string) => void>();
  private startedAt = Date.now();
  private storedDTCs = ["P0301", "P0171"];

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

  async scan(onDevice: (device: DiscoveredDevice) => void): Promise<void> {
    this.setState({ status: "scanning" });
    await new Promise((r) => setTimeout(r, 400));
    onDevice({ id: "mock-vlinker", name: "VLinker MC (Simulated)", rssi: -45 });
    this.setState({ status: "idle" });
  }

  stopScan(): void {}

  async connect(_deviceId: string): Promise<void> {
    this.setState({ status: "connecting" });
    await new Promise((r) => setTimeout(r, 500));
    this.startedAt = Date.now();
    this.setState({ status: "connected", deviceName: "VLinker MC (Simulated)" });
  }

  async disconnect(): Promise<void> {
    this.setState({ status: "disconnected" });
  }

  async write(_command: string): Promise<void> {}

  async writeAndRead(command: string): Promise<string> {
    await new Promise((r) => setTimeout(r, 30));
    return this.simulate(command);
  }

  private simulate(command: string): string {
    const cmd = command.toUpperCase().trim();
    const elapsedS = (Date.now() - this.startedAt) / 1000;
    const phase = (elapsedS % 60) / 60;
    const rpm = Math.round(850 + Math.max(0, Math.sin(phase * Math.PI * 2)) * 2200);
    const speedKmh = Math.max(0, Math.round(Math.sin(phase * Math.PI * 2 - 0.3) * 90));
    const coolant = Math.min(92, 20 + elapsedS * 0.5);

    const hexByte = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).toUpperCase().padStart(2, "0");
    const hex16 = (n: number) => Math.max(0, Math.min(65535, Math.round(n))).toString(16).toUpperCase().padStart(4, "0");

    if (cmd.startsWith("AT")) return "OK\r>";
    if (cmd === "0100") return `41 00 ${buildSupportedBitmask(PAGE0_PIDS, 0x00)}\r>`;
    if (cmd === "0120") return `41 20 ${buildSupportedBitmask(PAGE1_PIDS, 0x20)}\r>`;
    if (cmd === "0140") return `41 40 ${buildSupportedBitmask(PAGE2_PIDS, 0x40)}\r>`;
    if (cmd === "0902") {
      // Mode 09 PID 02: VIN, ASCII-encoded after a "49 02 01" prefix.
      const vin = "WBA8E9C05JA123456";
      const hex = Buffer.from(vin, "ascii").toString("hex").toUpperCase();
      return `49 02 01 ${hex.match(/.{1,2}/g)?.join(" ")}\r>`;
    }
    if (cmd === "03") {
      // Stored DTCs.
      const pairs = this.storedDTCs.map((code) => encodeDtc(code)).join(" ");
      return this.storedDTCs.length ? `43 ${pairs}\r>` : "NO DATA\r>";
    }
    if (cmd === "07") return "NO DATA\r>"; // no pending DTCs simulated
    if (cmd === "04") {
      this.storedDTCs = [];
      return "44\r>";
    }

    switch (cmd) {
      case "010C": {
        const raw = Math.round(rpm * 4);
        return `41 0C ${hex16(raw).slice(0, 2)} ${hex16(raw).slice(2)}\r>`;
      }
      case "010D":
        return `41 0D ${hexByte(speedKmh)}\r>`;
      case "0105":
        return `41 05 ${hexByte(coolant + 40)}\r>`;
      case "010F":
        return `41 0F ${hexByte(Math.min(coolant, 25) + 40)}\r>`;
      case "0111":
        return `41 11 ${hexByte(30 + Math.max(0, Math.sin(phase * Math.PI * 2)) * 150)}\r>`;
      case "012F":
        return `41 2F ${hexByte(0.6 * 255)}\r>`;
      case "0142": {
        const mv = Math.round(13800 + Math.sin(phase * Math.PI * 4) * 300);
        return `41 42 ${hex16(mv).slice(0, 2)} ${hex16(mv).slice(2)}\r>`;
      }
      case "0146":
        return `41 46 ${hexByte(22 + 40)}\r>`;
      case "0149":
        return `41 49 ${hexByte((speedKmh / 90) * 255)}\r>`;
      case "015C":
        return `41 5C ${hexByte(Math.min(coolant + 5, 95) + 40)}\r>`;
      case "015E": {
        const raw = Math.round((0.8 + Math.max(0, Math.sin(phase * Math.PI * 2)) * 1.5) * 20);
        return `41 5E ${hex16(raw).slice(0, 2)} ${hex16(raw).slice(2)}\r>`;
      }
      case "0104":
        return `41 04 ${hexByte(30 + Math.sin(phase * Math.PI * 2) * 20)}\r>`;
      default:
        return "NO DATA\r>";
    }
  }
}

function encodeDtc(code: string): string {
  const letters: Record<string, number> = { P: 0, C: 1, B: 2, U: 3 };
  const type = letters[code[0] ?? "P"] ?? 0;
  const d1 = parseInt(code[1] ?? "0", 16);
  const d2 = parseInt(code[2] ?? "0", 16);
  const d3 = parseInt(code[3] ?? "0", 16);
  const d4 = parseInt(code[4] ?? "0", 16);
  const a = (type << 6) | (d1 << 4) | d2;
  const b = (d3 << 4) | d4;
  return `${a.toString(16).toUpperCase().padStart(2, "0")} ${b.toString(16).toUpperCase().padStart(2, "0")}`;
}
