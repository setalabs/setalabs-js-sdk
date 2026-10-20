import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { TransportException } from "../src/exceptions.js";
import { FetchTransport } from "../src/http/fetch-transport.js";

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

async function withServer(handler: Handler, run: (url: string) => Promise<void>): Promise<void> {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address == null || typeof address === "string") {
    throw new Error("Expected a TCP port.");
  }

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

describe("FetchTransport", () => {
  it("returns status, headers and body", async () => {
    await withServer(
      (_request, response) => {
        response.writeHead(200, { "X-Request-Id": "req-1" });
        response.end('{"ok":true}');
      },
      async (url) => {
        const result = await new FetchTransport().send("GET", `${url}/v1/api/x/catalog`, { Accept: "application/json" }, null, 5);

        expect(result.statusCode).toBe(200);
        expect(result.requestId()).toBe("req-1");
        expect(result.json()).toEqual({ ok: true });
      },
    );
  });

  it("returns an HTTP error instead of throwing", async () => {
    await withServer(
      (_request, response) => {
        response.writeHead(401);
        response.end('{"error":"unauthorized","reason":"Invalid API key."}');
      },
      async (url) => {
        const result = await new FetchTransport().send("GET", `${url}/v1/api/x/catalog`, {}, null, 5);

        expect(result.statusCode).toBe(401);
        expect(result.json()).toMatchObject({ reason: "Invalid API key." });
      },
    );
  });

  it("does not follow redirects", async () => {
    await withServer(
      (_request, response) => {
        response.writeHead(302, { Location: "https://example.test/other" });
        response.end("go");
      },
      async (url) => {
        const result = await new FetchTransport().send("GET", `${url}/start`, {}, null, 5);

        expect(result.statusCode).toBe(302);
        expect(result.header("Location")).toBe("https://example.test/other");
        expect(result.body).toBe("go");
      },
    );
  });

  it("turns a connection failure into TransportException", async () => {
    const transport = new FetchTransport(() => {
      throw new TypeError("connection refused");
    });

    await expect(transport.send("GET", "https://gw.setalabs.com/v1/api/x/catalog", {}, null, 5)).rejects.toThrow(
      TransportException,
    );
    await expect(transport.send("GET", "https://gw.setalabs.com/v1/api/x/catalog", {}, null, 5)).rejects.toThrow(
      "connection refused",
    );
  });

  it("stops sending after the last shared user releases it", async () => {
    let calls = 0;
    const transport = new FetchTransport(async () => {
      calls += 1;
      return new Response('{"ok":true}', { status: 200 });
    });

    transport.acquire();
    transport.acquire();
    await transport.send("GET", "https://gw.setalabs.com/v1/api/x/catalog", {}, null, 5);
    transport.release();
    await transport.send("GET", "https://gw.setalabs.com/v1/api/x/catalog", {}, null, 5);
    transport.release();

    await expect(transport.send("GET", "https://gw.setalabs.com/v1/api/x/catalog", {}, null, 5)).rejects.toThrow(
      TransportException,
    );
    expect(calls).toBe(2);
  });
});
