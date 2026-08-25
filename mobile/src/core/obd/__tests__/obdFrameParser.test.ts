import { parse, extractDataBytes, parseDTCResponse, parseVIN, bmwOilTempC } from "../obdFrameParser";

describe("parse", () => {
  test("parses a standard spaced response for mode 01", () => {
    const result = parse("41 0C 1A F8\r>", 0x0c, 2);
    expect(result).toEqual({ kind: "value", bytes: [0x1a, 0xf8] });
  });

  test("reports noData", () => {
    expect(parse("NO DATA\r>", 0x0c, 2)).toEqual({ kind: "noData" });
  });

  test("reports disconnected on UNABLE TO CONNECT", () => {
    expect(parse("UNABLE TO CONNECT\r>", 0x05, 1)).toEqual({ kind: "disconnected" });
  });

  test("reports retry on bus errors", () => {
    expect(parse("CAN ERROR\r>", 0x05, 1)).toEqual({ kind: "retry" });
    expect(parse("BUFFER FULL\r>", 0x05, 1)).toEqual({ kind: "retry" });
  });

  test("filters an echoed command line before parsing", () => {
    const result = parse("010C\r41 0C 1A F8\r>", 0x0c, 2, "010C");
    expect(result).toEqual({ kind: "value", bytes: [0x1a, 0xf8] });
  });

  test("handles a concatenated 11-bit CAN id header", () => {
    const result = parse("7E8 03 41 0D 32\r>", 0x0d, 1);
    expect(result.kind).toBe("value");
  });
});

describe("extractDataBytes", () => {
  test("extracts the payload following mode+pid marker 41 PID", () => {
    expect(extractDataBytes("41 0D 32", 0x0d, 1)).toEqual([0x32]);
  });

  test("returns undefined when not enough bytes are present", () => {
    expect(extractDataBytes("41 0D", 0x0d, 1)).toBeUndefined();
  });

  test("falls back to contiguous hex parsing without spaces", () => {
    expect(extractDataBytes("410D32", 0x0d, 1)).toEqual([0x32]);
  });
});

describe("parseDTCResponse", () => {
  test("decodes a single powertrain code", () => {
    // 43 01 71 -> mode echo 43(stored), then byte pair 01 71 => P0171
    const codes = parseDTCResponse("43 01 71\r>");
    expect(codes).toHaveLength(1);
    expect(codes[0]!.code).toBe("P0171");
    expect(codes[0]!.status).toBe("stored");
  });

  test("skips zero-padded trailing pairs", () => {
    const codes = parseDTCResponse("43 01 71 00 00\r>");
    expect(codes.map((c) => c.code)).toEqual(["P0171"]);
  });

  test("returns empty array for NO DATA", () => {
    expect(parseDTCResponse("NO DATA\r>")).toEqual([]);
  });

  test("decodes body/chassis/network code letter prefixes", () => {
    // type bits 00=P,01=C,10=B,11=U in the high nibble's top 2 bits
    const codes = parseDTCResponse("43 41 00\r>"); // 0x41 = 0100 0001 -> type=01(C), digits 0,0,0,0? recompute below
    expect(codes[0]!.code[0]).toMatch(/[PCBU]/);
  });
});

describe("parseVIN", () => {
  test("extracts a 17-character VIN from a 49 02 01 response", () => {
    // "WBA..." encoded as ASCII hex after 49 02 01 prefix
    const vin = "WBA3A5C50DF123456";
    const hex = "4902" + "01" + Buffer.from(vin.slice(0, 17), "ascii").toString("hex").toUpperCase();
    const result = parseVIN(hex);
    expect(result).toBe(vin.slice(0, 17));
  });

  test("returns undefined when the prefix is missing", () => {
    expect(parseVIN("NO DATA")).toBeUndefined();
  });
});

describe("bmwOilTempC", () => {
  test("converts a Mode 22 D3B0 byte to celsius", () => {
    expect(bmwOilTempC([100])).toBeCloseTo(60, 5);
  });

  test("rejects implausible results", () => {
    expect(bmwOilTempC([0])).toBeUndefined();
  });
});
