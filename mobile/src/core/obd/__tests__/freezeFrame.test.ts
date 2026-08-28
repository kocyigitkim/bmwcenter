import {
  decodeFreezeFrameDTC,
  extractFreezeFrameBytes,
  freezeFrameCommand,
  FREEZE_FRAME_PIDS,
  type FreezeFrameValues,
} from "../freezeFrame";

describe("freezeFrameCommand", () => {
  it("formats mode, PID and frame number", () => {
    expect(freezeFrameCommand(0x0c)).toBe("020C00");
    expect(freezeFrameCommand(0x05, 1)).toBe("020501");
  });
});

describe("extractFreezeFrameBytes", () => {
  it("skips the frame-number byte that Mode 01 does not have", () => {
    // 42 0C 00 1A F8 -> rpm bytes are 1A F8, not 00 1A.
    expect(extractFreezeFrameBytes("42 0C 00 1A F8", 0x0c, 2)).toEqual([0x1a, 0xf8]);
  });

  it("finds the reply behind a CAN header", () => {
    expect(extractFreezeFrameBytes("7E8 06 42 0C 00 1A F8", 0x0c, 2)).toEqual([0x1a, 0xf8]);
  });

  it("tolerates unspaced replies and adapter noise", () => {
    expect(extractFreezeFrameBytes("SEARCHING...\r420C001AF8\r>", 0x0c, 2)).toEqual([0x1a, 0xf8]);
  });

  it("rejects a reply for a different PID", () => {
    expect(extractFreezeFrameBytes("42 05 00 5A", 0x0c, 2)).toBeUndefined();
  });

  it("rejects a reply for a different frame", () => {
    expect(extractFreezeFrameBytes("42 0C 01 1A F8", 0x0c, 2, 0)).toBeUndefined();
    expect(extractFreezeFrameBytes("42 0C 01 1A F8", 0x0c, 2, 1)).toEqual([0x1a, 0xf8]);
  });

  it("returns undefined for NO DATA and truncated frames", () => {
    expect(extractFreezeFrameBytes("NO DATA", 0x0c, 2)).toBeUndefined();
    expect(extractFreezeFrameBytes("42 0C 00 1A", 0x0c, 2)).toBeUndefined();
  });
});

describe("decodeFreezeFrameDTC", () => {
  it("decodes the two-byte DTC encoding", () => {
    expect(decodeFreezeFrameDTC([0x01, 0x33])).toBe("P0133");
    expect(decodeFreezeFrameDTC([0x43, 0x21])).toBe("C0321");
  });

  it("treats an all-zero code as no trigger", () => {
    expect(decodeFreezeFrameDTC([0x00, 0x00])).toBeUndefined();
  });
});

describe("FREEZE_FRAME_PIDS decoding", () => {
  function decode(pid: number, bytes: number[]): FreezeFrameValues {
    const out: FreezeFrameValues = {};
    FREEZE_FRAME_PIDS.find((p) => p.pid === pid)!.apply(bytes, out);
    return out;
  }

  it("decodes rpm, speed and coolant with their standard scaling", () => {
    expect(decode(0x0c, [0x1a, 0xf8]).rpm).toBeCloseTo(1726, 0);
    expect(decode(0x0d, [0x50]).speedKmh).toBe(80);
    expect(decode(0x05, [0x5a]).coolantC).toBe(50);
  });

  it("decodes fuel trims as signed percentages around 128", () => {
    expect(decode(0x06, [128]).fuelTrimShortPct).toBeCloseTo(0, 5);
    expect(decode(0x06, [192]).fuelTrimShortPct).toBeCloseTo(50, 5);
    expect(decode(0x07, [64]).fuelTrimLongPct).toBeCloseTo(-50, 5);
  });

  it("decodes load and throttle as percentages of 255", () => {
    expect(decode(0x04, [255]).engineLoadPct).toBeCloseTo(100, 5);
    expect(decode(0x11, [0]).throttlePct).toBe(0);
  });
});
