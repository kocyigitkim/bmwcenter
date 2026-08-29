import { buildCrashReport, describeError, formatCrashReport } from "../crashReport";

const AT = Date.UTC(2026, 7, 29, 6, 30);
const context = { at: AT, screen: "trip/[id]", appVersion: "1.0.0", platform: "android" };

describe("describeError", () => {
  it("takes the message from an Error", () => {
    expect(describeError(new Error("boom")).message).toBe("boom");
  });

  it("names an Error that has no message", () => {
    // `new TypeError()` has an empty message; showing "" tells the user nothing.
    expect(describeError(new TypeError()).message).toBe("TypeError");
  });

  it("handles a thrown string and a thrown object", () => {
    expect(describeError("plain failure").message).toBe("plain failure");
    expect(describeError({ code: 42 }).message).toBe('{"code":42}');
  });

  it("survives something that cannot be stringified", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(describeError(circular).message).toBe("Unknown error");
  });

  it("does not throw on null or undefined", () => {
    expect(describeError(null).message).toBeTruthy();
    expect(describeError(undefined).message).toBe("Unknown error");
  });
});

describe("buildCrashReport", () => {
  it("trims a long stack so the report stays pasteable", () => {
    const error = new Error("deep");
    error.stack = ["Error: deep", ...Array.from({ length: 40 }, (_, i) => `  at frame${i}`)].join("\n");
    const report = buildCrashReport(error, undefined, context);
    const lines = report.stack!.split("\n");
    expect(lines.length).toBeLessThanOrEqual(13);
    expect(lines[lines.length - 1]).toMatch(/more$/);
  });

  it("keeps a short stack whole", () => {
    const error = new Error("shallow");
    error.stack = "Error: shallow\n  at one\n  at two";
    expect(buildCrashReport(error, undefined, context).stack).toBe("Error: shallow\nat one\nat two");
  });

  it("carries the component stack when React gave one", () => {
    const report = buildCrashReport(new Error("x"), "\n    in TripScreen\n    in Stack", context);
    expect(report.componentStack).toContain("in TripScreen");
  });

  it("leaves the stacks undefined when there are none", () => {
    const report = buildCrashReport("thrown string", undefined, context);
    expect(report.stack).toBeUndefined();
    expect(report.componentStack).toBeUndefined();
  });
});

describe("formatCrashReport", () => {
  it("names the error, the screen and the build", () => {
    const text = formatCrashReport(buildCrashReport(new Error("boom"), undefined, context));
    expect(text).toContain("error: boom");
    expect(text).toContain("screen: trip/[id]");
    expect(text).toContain("version: 1.0.0");
    expect(text).toContain("2026-08-29");
  });

  it("omits sections it has nothing for", () => {
    const text = formatCrashReport(buildCrashReport("bare", undefined, { at: AT }));
    expect(text).not.toContain("screen:");
    expect(text).not.toContain("stack:");
    expect(text).not.toContain("components:");
  });

  it("carries no driving, location or vehicle data", () => {
    // A crash report should be safe to paste without a second thought.
    const text = formatCrashReport(
      buildCrashReport(new Error("boom"), "\n    in TripScreen", context)
    );
    for (const leak of ["latitude", "longitude", "vin", "odometer", "plate"]) {
      expect(text.toLowerCase()).not.toContain(leak);
    }
  });
});
