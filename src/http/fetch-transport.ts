import { TransportException } from "../exceptions.js";
import { Response } from "../response.js";
import type { Transport } from "./transport.js";

interface FetchResponseLike {
  readonly status: number;
  readonly headers: {
    forEach(callback: (value: string, name: string) => void): void;
    getSetCookie?: () => string[];
  };
  text(): Promise<string>;
}

export interface FetchInit {
  method: string;
  headers: Record<string, string>;
  body?: string;
  redirect: "manual";
  signal: AbortSignal;
}

export type FetchLike = (url: string, init: FetchInit) => Promise<FetchResponseLike>;

/**
 * HTTP transport backed by the global `fetch` implementation.
 * Same role as Guzzle in the PHP SDK and httpx in the Python SDK.
 *
 * `timeout` is the whole request deadline in seconds. Redirects are not followed:
 * a 3xx response is returned to the caller.
 */
export class FetchTransport implements Transport {
  private readonly fetchImpl: FetchLike;
  private users = 0;
  private closed = false;

  constructor(fetchImpl?: FetchLike) {
    if (fetchImpl == null && typeof globalThis.fetch !== "function") {
      throw new Error("Global fetch is not available. Use Node.js 18 or newer.");
    }
    this.fetchImpl =
      fetchImpl ??
      ((url, init) => {
        return globalThis.fetch(url, init);
      });
  }

  acquire(): void {
    this.users += 1;
  }

  release(): void {
    if (this.users === 0) {
      return;
    }
    this.users -= 1;
    if (this.users === 0) {
      this.close();
    }
  }

  close(): void {
    this.closed = true;
  }

  async send(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | null,
    timeout: number,
  ): Promise<Response> {
    if (this.closed) {
      throw new TransportException("Client is closed.");
    }

    const init: FetchInit = {
      method,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(timeout * 1000),
    };
    if (body !== null) {
      init.body = body;
    }

    try {
      const response = await this.fetchImpl(url, init);
      const text = await response.text();
      return new Response(response.status, collectHeaders(response), text);
    } catch (error) {
      throw new TransportException(transportMessage(error), { cause: error });
    }
  }
}

function collectHeaders(response: FetchResponseLike): Array<[string, string | readonly string[]]> {
  const pairs: Array<[string, string | readonly string[]]> = [];
  response.headers.forEach((value, name) => {
    pairs.push([name, value]);
  });

  const cookies = response.headers.getSetCookie?.() ?? [];
  if (cookies.length === 0) {
    return pairs;
  }

  return [...pairs.filter(([name]) => name.toLowerCase() !== "set-cookie"), ["set-cookie", cookies]];
}

function transportMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause;
    if (error.message === "fetch failed" && cause instanceof Error && cause.message !== "") {
      return cause.message;
    }
    if (error.message !== "") {
      return error.message;
    }
  }
  return "Request failed.";
}
