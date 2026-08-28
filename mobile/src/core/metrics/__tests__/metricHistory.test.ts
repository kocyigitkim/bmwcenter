import {
  MetricHistory,
  MetricRingBuffer,
  axisBounds,
  downsample,
  summarize,
} from "../metricHistory";

describe("MetricRingBuffer", () => {
  it("keeps samples in order and reports them oldest first", () => {
    const buffer = new MetricRingBuffer(10, 0);
    buffer.record(1000, 10);
    buffer.record(2000, 20);
    buffer.record(3000, 30);
    expect(buffer.samples()).toEqual([
      { t: 1000, value: 10 },
      { t: 2000, value: 20 },
      { t: 3000, value: 30 },
    ]);
  });

  it("drops the oldest sample once full instead of growing", () => {
    const buffer = new MetricRingBuffer(3, 0);
    for (let i = 1; i <= 5; i += 1) buffer.record(i * 1000, i);
    expect(buffer.size).toBe(3);
    expect(buffer.samples().map((s) => s.value)).toEqual([3, 4, 5]);
  });

  it("survives many wraps without losing ordering", () => {
    const buffer = new MetricRingBuffer(4, 0);
    for (let i = 0; i < 1000; i += 1) buffer.record(i, i);
    const times = buffer.samples().map((s) => s.t);
    expect(times).toEqual([996, 997, 998, 999]);
  });

  it("throttles samples that arrive faster than the interval", () => {
    const buffer = new MetricRingBuffer(10, 1000);
    expect(buffer.record(0, 1)).toBe(true);
    expect(buffer.record(400, 2)).toBe(false);
    expect(buffer.record(900, 3)).toBe(false);
    expect(buffer.record(1000, 4)).toBe(true);
    expect(buffer.samples().map((s) => s.value)).toEqual([1, 4]);
  });

  it("refuses samples timestamped before the last one", () => {
    // A clock step backwards would otherwise put the chart out of order.
    const buffer = new MetricRingBuffer(10, 0);
    buffer.record(5000, 1);
    expect(buffer.record(4000, 2)).toBe(false);
    expect(buffer.samples()).toEqual([{ t: 5000, value: 1 }]);
  });

  it("refuses values that are not finite", () => {
    const buffer = new MetricRingBuffer(10, 0);
    expect(buffer.record(1000, Number.NaN)).toBe(false);
    expect(buffer.record(2000, Infinity)).toBe(false);
    expect(buffer.size).toBe(0);
  });

  it("clears back to empty and can be reused", () => {
    const buffer = new MetricRingBuffer(3, 0);
    buffer.record(1000, 1);
    buffer.record(2000, 2);
    buffer.clear();
    expect(buffer.size).toBe(0);
    buffer.record(3000, 3);
    expect(buffer.samples()).toEqual([{ t: 3000, value: 3 }]);
  });
});

describe("MetricHistory", () => {
  it("records every numeric field a snapshot carries and nothing else", () => {
    const history = new MetricHistory(10, 0);
    history.record({ timestamp: 1000, rpm: 800, coolantC: 82 });
    expect(history.recorded().sort()).toEqual(["coolantC", "rpm"]);
    expect(history.series("rpm")!.samples).toEqual([{ t: 1000, value: 800 }]);
    // Never reported by this adapter.
    expect(history.series("boostActualKpa")).toBeUndefined();
  });

  it("does not record the timestamp itself as a metric", () => {
    const history = new MetricHistory(10, 0);
    history.record({ timestamp: 1000, rpm: 800 });
    expect(history.recorded()).not.toContain("timestamp");
  });

  it("keeps a metric that drops out of later snapshots", () => {
    // The adapter stops reporting oil temperature mid-drive; what was captured
    // before is still worth graphing.
    const history = new MetricHistory(10, 0);
    history.record({ timestamp: 1000, oilTempC: 90, rpm: 800 });
    history.record({ timestamp: 2000, rpm: 900 });
    expect(history.series("oilTempC")!.samples).toHaveLength(1);
    expect(history.series("rpm")!.samples).toHaveLength(2);
  });

  it("summarises the window it holds", () => {
    const history = new MetricHistory(10, 0);
    history.record({ timestamp: 1000, coolantC: 20 });
    history.record({ timestamp: 2000, coolantC: 60 });
    history.record({ timestamp: 3000, coolantC: 100 });
    const series = history.series("coolantC")!;
    expect(series.min).toBe(20);
    expect(series.max).toBe(100);
    expect(series.avg).toBe(60);
    expect(series.first).toBe(20);
    expect(series.last).toBe(100);
  });

  it("forgets everything when the drive ends", () => {
    const history = new MetricHistory(10, 0);
    history.record({ timestamp: 1000, rpm: 800 });
    history.clear();
    expect(history.recorded()).toEqual([]);
    expect(history.series("rpm")).toBeUndefined();
  });
});

describe("axisBounds", () => {
  it("pads the range so the line never sits on the frame", () => {
    const [low, high] = axisBounds(20, 100);
    expect(low).toBeLessThan(20);
    expect(high).toBeGreaterThan(100);
  });

  it("gives a flat series a band rather than a zero-height axis", () => {
    const [low, high] = axisBounds(14.2, 14.2);
    expect(high).toBeGreaterThan(low);
    expect(low).toBeLessThan(14.2);
    expect(high).toBeGreaterThan(14.2);
  });

  it("falls back to a usable axis with no data", () => {
    expect(axisBounds(Infinity, -Infinity)).toEqual([0, 1]);
  });
});

describe("downsample", () => {
  it("leaves a short series untouched", () => {
    const samples = [
      { t: 1, value: 1 },
      { t: 2, value: 2 },
    ];
    expect(downsample(samples, 10)).toBe(samples);
  });

  it("averages into buckets rather than dropping samples", () => {
    const samples = Array.from({ length: 100 }, (_, i) => ({ t: i, value: i }));
    const reduced = downsample(samples, 10);
    expect(reduced).toHaveLength(10);
    // The first bucket covers 0..9, mean 4.5.
    expect(reduced[0]!.value).toBeCloseTo(4.5, 5);
    expect(reduced[9]!.value).toBeCloseTo(94.5, 5);
  });

  it("keeps a spike visible instead of aliasing it away", () => {
    const samples = Array.from({ length: 100 }, (_, i) => ({ t: i, value: i === 50 ? 200 : 0 }));
    const reduced = downsample(samples, 10);
    expect(Math.max(...reduced.map((s) => s.value))).toBeGreaterThan(0);
  });

  it("stays monotonic in time", () => {
    const samples = Array.from({ length: 500 }, (_, i) => ({ t: i * 1000, value: Math.sin(i) }));
    const reduced = downsample(samples, 60);
    for (let i = 1; i < reduced.length; i += 1) {
      expect(reduced[i]!.t).toBeGreaterThan(reduced[i - 1]!.t);
    }
  });
});

describe("summarize", () => {
  it("reports zeroes for an empty series rather than NaN", () => {
    const series = summarize("rpm", []);
    expect(series.avg).toBe(0);
    expect(series.first).toBe(0);
    expect(series.last).toBe(0);
  });
});
