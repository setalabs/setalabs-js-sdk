import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Signer } from "../src/signer.js";

describe("Signer", () => {
  it("matches the gateway algorithm", () => {
    const apiKey = "key-1";
    const secret = "secret-1";
    const timestamp = "1700000000";
    const pathWithQuery = "/v1/api/uuid/items?q=1";

    const expected = createHmac("sha256", secret)
      .update(`${apiKey}${secret}${timestamp}${pathWithQuery}`, "utf8")
      .digest("hex");

    expect(Signer.sign(apiKey, secret, timestamp, pathWithQuery)).toBe(expected);
    expect(expected).toBe(expected.toLowerCase());
    expect(expected).toHaveLength(64);
  });
});
