import { parseResponse } from "../fuelPriceParser";

describe("parseResponse", () => {
  test("parses openvan.camp's real per-country shape for the requested country", () => {
    const response = {
      success: true,
      data: {
        TR: {
          country_code: "TR",
          currency: "TRY",
          prices: { gasoline_regular: null, gasoline: 71.4443, diesel: 82.0746, lpg: 33.8467, cng: null },
        },
        US: {
          country_code: "US",
          currency: "USD",
          prices: { gasoline: 3.5, diesel: 4.1, lpg: null },
        },
      },
    };
    expect(parseResponse(response, "TR")).toEqual({ gasoline: 71.4443, diesel: 82.0746, lpg: 33.8467, currencyCode: "TRY" });
  });

  test("picks the requested country, not just the first one", () => {
    const response = {
      data: {
        US: { currency: "USD", prices: { gasoline: 3.5 } },
        TR: { currency: "TRY", prices: { gasoline: 71.4 } },
      },
    };
    expect(parseResponse(response, "TR")).toEqual({ gasoline: 71.4, currencyCode: "TRY" });
  });

  test("falls back to the first country if the requested one is missing", () => {
    const response = { data: { US: { currency: "USD", prices: { gasoline: 3.5 } } } };
    expect(parseResponse(response, "TR")).toEqual({ gasoline: 3.5, currencyCode: "USD" });
  });

  test("parses a flat shape (defensive fallback)", () => {
    expect(parseResponse({ gasoline: 44.5, diesel: 46.2, lpg: 24.1, currency: "TRY" })).toEqual({
      gasoline: 44.5,
      diesel: 46.2,
      lpg: 24.1,
      currencyCode: "TRY",
    });
  });

  test("parses a nested `prices` shape (defensive fallback)", () => {
    expect(parseResponse({ prices: { gasoline: 44.5, diesel: 46.2 }, currencyCode: "TRY" })).toEqual({
      gasoline: 44.5,
      diesel: 46.2,
      currencyCode: "TRY",
    });
  });

  test("parses an array-of-entries shape (defensive fallback)", () => {
    const result = parseResponse({
      fuels: [
        { type: "gasoline", price: 44.5 },
        { type: "diesel", price: "46.2" },
      ],
      currency: "TRY",
    });
    expect(result.gasoline).toBeCloseTo(44.5);
    expect(result.diesel).toBeCloseTo(46.2);
    expect(result.currencyCode).toBe("TRY");
  });

  test("recognizes localized/aliased fuel names", () => {
    expect(parseResponse({ benzin: 44.5, motorin: 46.2 })).toEqual({ gasoline: 44.5, diesel: 46.2 });
  });

  test("ignores unrecognized shapes without throwing", () => {
    expect(parseResponse(null)).toEqual({});
    expect(parseResponse("not json")).toEqual({});
    expect(parseResponse({ unrelated: true })).toEqual({});
  });
});
