export type ConnectionState =
  | { status: "idle" }
  | { status: "scanning" }
  | { status: "connecting"; deviceName?: string }
  | { status: "connected"; deviceName?: string }
  | { status: "disconnected"; reason?: string }
  | { status: "error"; message: string };

export interface DiscoveredDevice {
  id: string;
  name: string | null;
  rssi: number | null;
}

/** Common interface implemented by every adapter transport (BLE, mock, replay). */
export interface OBDTransport {
  readonly state: ConnectionState;
  /** False for simulated transports, whose device ids must never be remembered as the
   * user's real adapter. */
  readonly isRealAdapter: boolean;
  onStateChange(listener: (state: ConnectionState) => void): () => void;
  onLine(listener: (line: string) => void): () => void;

  scan(onDevice: (device: DiscoveredDevice) => void, timeoutMs?: number): Promise<void>;
  stopScan(): void;
  connect(deviceId: string): Promise<void>;
  disconnect(): Promise<void>;

  /** Checks permissions/radio ahead of a `connect()` that skips scanning. Transports
   * with no such preconditions may omit this. */
  prepareForDirectConnect?(): Promise<boolean>;

  /** Write a raw AT/OBD command, terminated with CR by the implementation. */
  write(command: string): Promise<void>;

  /** Write a command and await the full response up to the `>` prompt. */
  writeAndRead(command: string, timeoutMs?: number): Promise<string>;
}
