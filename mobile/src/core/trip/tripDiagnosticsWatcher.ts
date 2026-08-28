/**
 * Watches for faults setting while a trip is being recorded.
 *
 * The app otherwise only learns about a trouble code when the user runs a scan,
 * by which time the conditions that set it are gone. One cheap read of Mode 01
 * PID 01 every half minute gives the MIL state and the stored-code count; when
 * either moves, the codes and the ECU's freeze frame are pulled straight away
 * and pinned to the drive.
 *
 * Codes already present on the first read are recorded as known, not as events:
 * a fault that was there when the engine started did not set on this drive.
 */

import { db } from "../storage/db";
import { dtcRecords, tripDiagnosticEvents } from "../storage/schema";
import { useOBDStore } from "../obd/obdService";
import { ELM327Commands } from "../obd/elm327Commands";
import { parseDTCResponse } from "../obd/obdFrameParser";
import { activeVehicleId } from "../vehicle/useGarage";
import { eq } from "drizzle-orm";
import { milTransition, newlySetCodes, type ObservedCode } from "./tripDiagnostics";
import type { VehicleSnapshot } from "../obd/vehicleSnapshot";
import type { FreezeFrameValues } from "../obd/freezeFrame";

/** One extra command every half minute is invisible next to the live poll loop. */
const CHECK_INTERVAL_MS = 30_000;

/** Sensors worth pinning to a fault beyond whatever the freeze frame carries. */
function contextOf(snapshot: VehicleSnapshot): Record<string, number> {
  const context: Record<string, number> = {};
  for (const key of [
    "speedKmh",
    "rpm",
    "coolantC",
    "engineLoadPct",
    "throttlePct",
    "voltage",
    "intakeAirC",
    "oilTempC",
  ] as const) {
    const value = snapshot[key];
    if (typeof value === "number" && Number.isFinite(value)) context[key] = value;
  }
  return context;
}

class TripDiagnosticsWatcher {
  private tripId: string | undefined;
  private lastCheckAt = 0;
  private known: ObservedCode[] = [];
  private knownCount = 0;
  private milOn: boolean | undefined;
  private seeded = false;
  private busy = false;

  start(tripId: string): void {
    this.tripId = tripId;
    this.lastCheckAt = 0;
    this.known = [];
    this.knownCount = 0;
    this.milOn = undefined;
    this.seeded = false;
  }

  stop(): void {
    this.tripId = undefined;
  }

  /** Driven by the trip recorder's sample loop; rate-limits itself. */
  onSample(snapshot: VehicleSnapshot, now: number): void {
    if (!this.tripId || this.busy) return;
    if (now - this.lastCheckAt < CHECK_INTERVAL_MS) return;
    this.lastCheckAt = now;
    this.busy = true;
    this.check(snapshot, now)
      .catch(() => undefined)
      .finally(() => {
        this.busy = false;
      });
  }

  private async check(snapshot: VehicleSnapshot, now: number): Promise<void> {
    const store = useOBDStore.getState();
    if (store.connection.status !== "connected") return;

    const readiness = await store.readReadiness();
    if (!readiness) return;
    const tripId = this.tripId;
    if (!tripId) return; // the trip ended while the read was in flight

    const transition = milTransition(this.milOn, readiness.milOn);
    this.milOn = readiness.milOn;
    if (transition) {
      await this.record(tripId, { t: now, kind: transition, context: contextOf(snapshot) });
    }

    // Nothing new to fetch unless the count grew, which saves two commands on
    // every check of a healthy car.
    const grew = readiness.dtcCount > this.knownCount;
    this.knownCount = readiness.dtcCount;
    if (!grew && this.seeded) return;
    if (readiness.dtcCount === 0 && this.seeded) return;

    const current = await this.readCodes();
    if (current.length === 0) return;

    if (!this.seeded) {
      this.seeded = true;
      this.known = current;
      return;
    }

    const fresh = newlySetCodes(this.known, current);
    this.known = current;
    if (fresh.length === 0) return;

    // One freeze frame read serves every code that set in the same moment: the
    // ECU stores a single frame, and it names the code it belongs to.
    const frame = await useOBDStore.getState().readFreezeFrame();
    for (const code of fresh) {
      await this.record(tripId, {
        t: now,
        kind: "code",
        code: code.code,
        status: code.status,
        freezeFrame: frame,
        context: contextOf(snapshot),
      });
      await this.rememberCode(tripId, code, frame, now);
    }
  }

  private async readCodes(): Promise<ObservedCode[]> {
    const { transport } = useOBDStore.getState();
    const read = async (command: string, status: "stored" | "pending") => {
      try {
        return parseDTCResponse(await transport.writeAndRead(command, 4000), status);
      } catch {
        return [];
      }
    };
    // Permanent codes are not read here: they cannot appear without a stored
    // code appearing first, so they would only cost a command per check.
    return [
      ...(await read(ELM327Commands.readDTCs, "stored")),
      ...(await read(ELM327Commands.readPendingDTCs, "pending")),
    ];
  }

  private async record(
    tripId: string,
    event: {
      t: number;
      kind: string;
      code?: string;
      status?: string;
      freezeFrame?: FreezeFrameValues;
      context?: Record<string, number>;
    }
  ): Promise<void> {
    await db.insert(tripDiagnosticEvents).values({
      tripId,
      t: event.t,
      kind: event.kind,
      code: event.code ?? null,
      status: event.status ?? null,
      freezeFrameJSON: event.freezeFrame ? JSON.stringify(event.freezeFrame) : null,
      contextJSON: event.context ? JSON.stringify(event.context) : null,
    });
  }

  /** Keeps the scan screen's record in step, and notes which drive set the code. */
  private async rememberCode(
    tripId: string,
    code: ObservedCode,
    frame: FreezeFrameValues | undefined,
    now: number
  ): Promise<void> {
    const existing = await db.select().from(dtcRecords).where(eq(dtcRecords.code, code.code));
    const open = existing.find((r) => r.clearedAt == null);
    if (open) {
      if (open.tripId == null) {
        await db.update(dtcRecords).set({ tripId }).where(eq(dtcRecords.id, open.id));
      }
      return;
    }
    await db.insert(dtcRecords).values({
      vehicleId: activeVehicleId(),
      tripId,
      code: code.code,
      seenAt: now,
      status: code.status,
      freezeFrameJSON: frame ? JSON.stringify(frame) : null,
    });
  }
}

export const tripDiagnosticsWatcher = new TripDiagnosticsWatcher();
