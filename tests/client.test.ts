import { describe, expect, it } from "vitest";
import { Client } from "../src/client.js";
import { UnauthorizedException } from "../src/exceptions.js";
import { FetchTransport } from "../src/http/fetch-transport.js";
import { Gateway } from "../src/gateway.js";
import { Response } from "../src/response.js";
import { Signer } from "../src/signer.js";
import { RecordingTransport, type RecordedCall } from "./recording-transport.js";

const UUID = "05141812-7772-403e-9ca6-5e8e8bf22730";
const KEY = "key-1";
const SECRET = "secret-1";

function client(transport: RecordingTransport): Client {
  return new Client(UUID, KEY, SECRET, Gateway.URL, 30, transport);
}

function headers(call: RecordedCall): Record<string, string> {
  return call.headers;
}

describe("Client", () => {
  it("signs a get and keeps query order", async () => {
    const transport = new RecordingTransport(
      new Response(200, { "X-Request-Id": "req-1", "Content-Type": "application/json" }, '{"ok":true}'),
    );

    const response = await client(transport).get("/catalog", { b: "2", a: "1" });

    expect(response.successful()).toBe(true);
    expect(response.json()).toEqual({ ok: true });
    expect(response.requestId()).toBe("req-1");

    const call = transport.calls[0];
    expect(call).toBeDefined();
    if (call === undefined) {
      return;
    }
    const pathWithQuery = `/v1/api/${UUID}/catalog?b=2&a=1`;
    const sent = headers(call);
    expect(call.method).toBe("GET");
    expect(call.url).toBe(Gateway.URL + pathWithQuery);
    expect(sent["X-Api-Key"]).toBe(KEY);
    expect(sent["X-Api-Secret"]).toBeUndefined();
    expect(sent["X-Api-Sign"]).toBe(Signer.sign(KEY, SECRET, sent["X-Api-Timestamp"] ?? "", pathWithQuery));
    expect(sent.Accept).toBe("application/json");
    expect(sent["User-Agent"]).toBe(`setalabs-js-sdk/${Client.VERSION}`);
    expect(call.timeout).toBe(30);
  });

  it("signs the decoded path and the encoded query", async () => {
    const transport = new RecordingTransport(new Response(200, {}, '{"items":[]}'));

    await client(transport).get("/product/a b", { q: "x y" });

    const call = transport.calls[0];
    expect(call).toBeDefined();
    if (call === undefined) {
      return;
    }
    const signed = `/v1/api/${UUID}/product/a b?q=x%20y`;
    const wire = `${Gateway.URL}/v1/api/${UUID}/product/a%20b?q=x%20y`;
    const sent = headers(call);
    expect(call.url).toBe(wire);
    expect(sent["X-Api-Sign"]).toBe(Signer.sign(KEY, SECRET, sent["X-Api-Timestamp"] ?? "", signed));
  });

  it("does not sign a key without a secret", async () => {
    const transport = new RecordingTransport(new Response(200, {}, "{}"));
    const unsigned = new Client(UUID, KEY, "", Gateway.URL, 30, transport);

    await unsigned.get("/langs");

    const call = transport.calls[0];
    expect(call).toBeDefined();
    if (call === undefined) {
      return;
    }
    const sent = headers(call);
    expect(sent["X-Api-Key"]).toBe(KEY);
    expect(sent["X-Api-Sign"]).toBeUndefined();
    expect(sent["X-Api-Timestamp"]).toBeUndefined();
    expect(sent["X-Api-Secret"]).toBeUndefined();
    expect(call.url).toBe(`${Gateway.URL}/v1/api/${UUID}/langs`);
  });

  it("sends a JSON body", async () => {
    const transport = new RecordingTransport(new Response(201, {}, '{"id":"1"}'));

    const response = await client(transport).post("/orders", { sku: "a/b" });

    const call = transport.calls[0];
    expect(response.statusCode).toBe(201);
    expect(call?.body).toBe('{"sku":"a/b"}');
    expect(call?.headers["Content-Type"]).toBe("application/json");
    expect(call?.method).toBe("POST");
  });

  it("keeps a caller content type and a raw body", async () => {
    const transport = new RecordingTransport(new Response(200, {}, "{}"));

    await client(transport).request("PUT", "/orders/1", {
      body: "raw",
      query: { language: "en" },
      timeout: 10,
      headers: { "Content-Type": "text/plain" },
    });

    const call = transport.calls[0];
    expect(call?.method).toBe("PUT");
    expect(call?.body).toBe("raw");
    expect(call?.timeout).toBe(10);
    expect(call?.headers["Content-Type"]).toBe("text/plain");
    expect(call?.url).toBe(`${Gateway.URL}/v1/api/${UUID}/orders/1?language=en`);
  });

  it("throws a gateway error", async () => {
    const transport = new RecordingTransport(
      new Response(401, { "X-Request-Id": "req-9" }, '{"error":"unauthorized","reason":"Invalid API signature."}'),
    );

    const error = await client(transport)
      .get("/catalog")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnauthorizedException);
    if (!(error instanceof UnauthorizedException)) {
      return;
    }
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe("Invalid API signature.");
    expect(error.requestId).toBe("req-9");
  });

  it("drops a reserved secret header", async () => {
    const transport = new RecordingTransport(new Response(200, {}, "{}"));

    await client(transport).get("/catalog", {}, { "X-Api-Secret": "do-not-send", "X-Trace": "1" });

    const sent = transport.calls[0]?.headers;
    expect(sent?.["X-Api-Secret"]).toBeUndefined();
    expect(sent?.["X-Trace"]).toBe("1");
  });

  it("targets another API", async () => {
    const transport = new RecordingTransport(new Response(200, {}, "{}"));
    const other = client(transport).withApi("another-api", "other-key", "other-secret");

    await other.get("/health");

    const call = transport.calls[0];
    expect(call).toBeDefined();
    if (call === undefined) {
      return;
    }
    const sent = headers(call);
    expect(call.url).toContain("/v1/api/another-api/health");
    expect(sent["X-Api-Key"]).toBe("other-key");
    const path = "/v1/api/another-api/health";
    expect(sent["X-Api-Sign"]).toBe(Signer.sign("other-key", "other-secret", sent["X-Api-Timestamp"] ?? "", path));
  });

  it("defaults to the production gateway", async () => {
    const transport = new RecordingTransport(new Response(200, {}, "{}"));
    const production = new Client({
      apiUuid: UUID,
      apiKey: KEY,
      apiSecret: SECRET,
      transport,
    });

    await production.get("/catalog");

    expect(transport.calls[0]?.url).toBe(`${Gateway.URL}/v1/api/${UUID}/catalog`);
  });

  it("accepts another gateway root", async () => {
    const transport = new RecordingTransport(new Response(200, {}, "{}"));
    const local = new Client(UUID, KEY, SECRET, "https://gw.example.test/", 30, transport);

    await local.get("/catalog");

    expect(transport.calls[0]?.url).toBe(`https://gw.example.test/v1/api/${UUID}/catalog`);
  });

  it("lowercases the API uuid and trims the key", async () => {
    const transport = new RecordingTransport(new Response(200, {}, "{}"));
    const normalized = new Client(UUID.toUpperCase(), `  ${KEY}  `, "   ", Gateway.URL, 30, transport);

    await normalized.get("/langs");

    const call = transport.calls[0];
    expect(call?.url).toBe(`${Gateway.URL}/v1/api/${UUID}/langs`);
    expect(call?.headers["X-Api-Key"]).toBe(KEY);
    expect(call?.headers["X-Api-Sign"]).toBeUndefined();
  });

  it("rejects a gateway that is not the root", () => {
    expect(() => new Client(UUID, KEY, SECRET, `${Gateway.URL}/v1/api/${UUID}`)).toThrow(
      "Gateway address must be the gateway root",
    );
  });

  it("rejects a query in the path", async () => {
    const api = client(new RecordingTransport(new Response(200, {}, "{}")));

    await expect(api.get("/catalog?language=en")).rejects.toThrow("Pass query parameters separately from the path.");
  });

  it("rejects an unsupported method, a bad timeout, and mixed bodies", async () => {
    const api = client(new RecordingTransport(new Response(200, {}, "{}")));

    await expect(api.request("TRACE", "/catalog")).rejects.toThrow('Unsupported HTTP method "TRACE".');
    await expect(api.request("GET", "/catalog", { timeout: 0 })).rejects.toThrow("Timeout must be greater than zero.");
    await expect(api.request("POST", "/orders", { json: { sku: "A1" }, body: "raw" })).rejects.toThrow(
      "Pass either json or body, not both.",
    );
  });

  it("rejects a key with a line break", () => {
    expect(() => new Client(UUID, "bad\nkey", SECRET)).toThrow("API key must not contain line breaks.");
  });

  it("can be closed more than once", () => {
    const api = client(new RecordingTransport(new Response(200, {}, "{}")));

    api.close();
    api.close();
  });

  it("shares the owned transport until every client is closed", () => {
    const events: string[] = [];
    const originalAcquire = FetchTransport.prototype.acquire;
    const originalRelease = FetchTransport.prototype.release;
    FetchTransport.prototype.acquire = function acquire() {
      events.push("acquire");
      originalAcquire.call(this);
    };
    FetchTransport.prototype.release = function release() {
      events.push("release");
      originalRelease.call(this);
    };

    try {
      const api = new Client({ apiUuid: UUID, apiKey: KEY, apiSecret: SECRET });
      const other = api.withApi("another-api", "other-key", "other-secret");
      api.close();
      other.close();
      api.close();
      expect(events).toEqual(["acquire", "acquire", "release", "release"]);
    } finally {
      FetchTransport.prototype.acquire = originalAcquire;
      FetchTransport.prototype.release = originalRelease;
    }
  });
});
