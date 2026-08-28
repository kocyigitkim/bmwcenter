import {
  buildTimeline,
  milTransition,
  newlySetCodes,
  sensorSeries,
  summarizeSensors,
  wasReported,
} from "../tripDiagnostics";

const START = Date.UTC(2026, 2, 1, 8, 0, 0);

describe("newlySetCodes", () => {
  it("reports a code that was not there before", () => {
    const fresh = newlySetCodes([{ code: "P0171", status: "stored" }], [
      { code: "P0171", status: "stored" },
      { code: "P0301", status: "pending" },
    ]);
    expect(fresh).toEqual([{ code: "P0301", status: "pending" }]);
  });

  it("does not report the same fault again when it matures from pending to stored", () => {
    const fresh = newlySetCodes(
      [{ code: "P0301", status: "pending" }],
      [{ code: "P0301", status: "stored" }]
    );
    expect(fresh).toEqual([]);
  });

  it("counts a code echoed twice in one reply as one fault", () => {
    const fresh = newlySetCodes([], [
      { code: "P0420", status: "stored" },
      { code: "P0420", status: "pending" },
    ]);
    expect(fresh).toEqual([{ code: "P0420", status: "stored" }]);
  });

  it("reports everything on the first read of a drive that starts with codes", () => {
    expect(newlySetCodes([], [{ code: "P0128", status: "stored" }])).toHaveLength(1);
  });

  it("says nothing when a code goes away", () => {
    expect(newlySetCodes([{ code: "P0171", status: "stored" }], [])).toEqual([]);
  });
});

describe("milTransition", () => {
  it("does not claim the lamp came on during the drive when it was already lit", () => {
    expect(milTransition(undefined, true)).toBe("milAlreadyOn");
    expect(milTransition(undefined, false)).toBeUndefined();
  });

  it("records the lamp turning on and off mid-drive", () => {
    expect(milTransition(false, true)).toBe("milOn");
    expect(milTransition(true, false)).toBe("milOff");
  });

  it("stays quiet while nothing changes", () => {
    expect(milTransition(true, true)).toBeUndefined();
    expect(milTransition(false, false)).toBeUndefined();
  });
});

describe("buildTimeline", () => {
  it("merges codes and protection warnings into one ordered account", () => {
    const timeline = buildTimeline(
      START,
      [
        { t: START + 300_000, kind: "code", code: "P0301", status: "pending" },
        { t: START + 60_000, kind: "milOn" },
      ],
      [{ t: START + 120_000, type: "overheat", severity: "alarm" }]
    );
    expect(timeline.map((e) => e.kind)).toEqual(["milOn", "protection", "code"]);
    expect(timeline.map((e) => e.offsetS)).toEqual([60, 120, 300]);
  });

  it("carries the freeze frame through to the entry", () => {
    const timeline = buildTimeline(
      START,
      [{ t: START + 1000, kind: "code", code: "P0420", freezeFrame: { rpm: 2100 } }],
      []
    );
    expect(timeline[0]!.freezeFrame).toEqual({ rpm: 2100 });
  });

  it("never reports a negative offset for an event stamped before the start", () => {
    const timeline = buildTimeline(START, [{ t: START - 5000, kind: "milOn" }], []);
    expect(timeline[0]!.offsetS).toBe(0);
  });

  it("returns an empty timeline for an uneventful drive", () => {
    expect(buildTimeline(START, [], [])).toEqual([]);
  });
});

describe("wasReported", () => {
  it("treats an unbroken run of zeroes as a PID the car never answered", () => {
    // trip_samples' original columns are NOT NULL DEFAULT 0.
    expect(wasReported([0, 0, 0, 0])).toBe(false);
  });

  it("accepts a sensor that reads zero only some of the time", () => {
    expect(wasReported([0, 0, 14, 0])).toBe(true);
  });

  it("treats all-null and empty as not reported", () => {
    expect(wasReported([null, undefined, null])).toBe(false);
    expect(wasReported([])).toBe(false);
  });

  it("ignores values that are not finite", () => {
    expect(wasReported([Number.NaN, 0])).toBe(false);
  });
});

describe("summarizeSensors", () => {
  const samples = [
    { t: 1, coolantC: 40, voltage: 14.1, mapKpa: 0 },
    { t: 2, coolantC: 80, voltage: null, mapKpa: 0 },
    { t: 3, coolantC: 90, voltage: 13.9, mapKpa: 0 },
  ];

  it("reports min, average and max per sensor", () => {
    const [coolant] = summarizeSensors(samples, ["coolantC"]);
    expect(coolant).toMatchObject({ key: "coolantC", min: 40, max: 90, count: 3 });
    expect(coolant!.avg).toBeCloseTo(70, 5);
  });

  it("skips gaps rather than counting them as zero", () => {
    const [voltage] = summarizeSensors(samples, ["voltage"]);
    expect(voltage!.count).toBe(2);
    expect(voltage!.avg).toBeCloseTo(14.0, 5);
  });

  it("leaves out a sensor the car never reported", () => {
    expect(summarizeSensors(samples, ["mapKpa"])).toEqual([]);
    expect(summarizeSensors(samples, ["oilTempC"])).toEqual([]);
  });

  it("keeps the order the caller asked for", () => {
    const keys = summarizeSensors(samples, ["voltage", "coolantC"]).map((s) => s.key);
    expect(keys).toEqual(["voltage", "coolantC"]);
  });
});

describe("sensorSeries", () => {
  it("drops gaps so the line is not pulled to zero", () => {
    const series = sensorSeries(
      [
        { t: 1, oilTempC: 60 },
        { t: 2, oilTempC: null },
        { t: 3, oilTempC: 92 },
      ],
      "oilTempC"
    );
    expect(series).toEqual([
      { t: 1, value: 60 },
      { t: 3, value: 92 },
    ]);
  });
});
