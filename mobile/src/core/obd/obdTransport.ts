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
  onStateChange(listener: (state: ConnectionState) => void): () => void;
  onLine(listener: (line: string) => void): () => void;

  scan(onDevice: (device: DiscoveredDevice) => void, timeoutMs?: number): Promise<void>;
  stopScan(): void;
  connect(deviceId: string): Promise<void>;
  disconnect(): Promise<void>;

  /** Write a raw AT/OBD command, terminated with CR by the implementation. */
  write(command: string): Promise<void>;

  /** Write a command and await the full response up to the `>` prompt. */
  writeAndRead(command: string, timeoutMs?: number): Promise<string>;
}
