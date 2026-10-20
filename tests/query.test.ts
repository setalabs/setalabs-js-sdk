import { describe, expect, it } from "vitest";
import { buildQuery, formatPhpFloat } from "../src/query.js";

describe("buildQuery", () => {
  it("matches PHP http_build_query", () => {
    const query = buildQuery({
      b: "2",
      a: "1",
      q: "x y",
      flag: true,
      off: false,
      n: null,
      ids: [1, null, "x"],
      f: { x: "a/b" },
      whole: 1.0,
      frac: 1.5,
      big: 1e16,
    });

    expect(query).toBe(
      "b=2&a=1&q=x%20y&flag=1&off=0&ids%5B0%5D=1&ids%5B2%5D=x&f%5Bx%5D=a%2Fb&whole=1&frac=1.5&big=1.0E%2B16",
    );
  });

  it("keeps a raw query string", () => {
    expect(buildQuery("?language=en&q=a b")).toBe("language=en&q=a b");
  });

  it("rejects an empty parameter name", () => {
    expect(() => buildQuery({ "": "x" })).toThrow("Query parameter name must not be empty.");
  });
});

describe("formatPhpFloat", () => {
  it.each([
    [0, "0"],
    [-0, "-0"],
    [-1.5, "-1.5"],
    [0.1, "0.1"],
    [0.0001, "0.0001"],
    [1e-5, "1.0E-5"],
    [1e-7, "1.0E-7"],
    [1.23e-8, "1.23E-8"],
    [1.1, "1.1"],
    [10, "10"],
    [1 / 3, "0.33333333333333"],
    [1e14, "1.0E+14"],
    [1e16, "1.0E+16"],
    [Number.POSITIVE_INFINITY, "INF"],
    [Number.NEGATIVE_INFINITY, "-INF"],
    [Number.NaN, "NAN"],
  ])("formats %s as %s", (value, expected) => {
    expect(formatPhpFloat(value)).toBe(expected);
  });
});
