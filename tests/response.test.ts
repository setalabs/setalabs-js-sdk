import { describe, expect, it } from "vitest";
import { SetalabsException } from "../src/exceptions.js";
import { Response } from "../src/response.js";

describe("Response", () => {
  it("reads the first header value and ignores case", () => {
    const response = new Response(200, { "X-Request-Id": ["req-1", "req-2"] }, "{}");

    expect(response.header("x-request-id")).toBe("req-1");
    expect(response.requestId()).toBe("req-1");
    expect(response.successful()).toBe(true);
    expect(response.json()).toEqual({});
  });

  it("rejects an empty or invalid JSON body", () => {
    expect(() => new Response(200, {}, "").json()).toThrow(SetalabsException);
    expect(() => new Response(200, {}, "").json()).toThrow("Response body is empty.");
    expect(() => new Response(200, {}, "nope").json()).toThrow("Response body is not valid JSON.");
  });
});
