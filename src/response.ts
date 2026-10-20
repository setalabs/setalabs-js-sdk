import { SetalabsException } from "./exceptions.js";
import { isPlainObject } from "./object.js";

export type HeaderInput =
  | Record<string, string | readonly string[]>
  | Iterable<readonly [string, string | readonly string[]]>;

export class Response {
  readonly statusCode: number;
  /** Lowercase header names mapped to every value sent for that name. */
  readonly headers: Record<string, string[]>;
  readonly body: string;

  constructor(statusCode: number, headers: HeaderInput, body: string) {
    const normalized: Record<string, string[]> = {};
    for (const [name, values] of headerEntries(headers)) {
      const key = String(name).toLowerCase();
      const items = typeof values === "string" ? [values] : [...values];
      const bucket = normalized[key] ?? [];
      for (const value of items) {
        bucket.push(String(value));
      }
      normalized[key] = bucket;
    }

    this.statusCode = statusCode;
    this.headers = normalized;
    this.body = body;
  }

  successful(): boolean {
    return this.statusCode >= 200 && this.statusCode < 300;
  }

  header(name: string): string | null {
    const values = this.headers[name.toLowerCase()] ?? [];
    return values[0] ?? null;
  }

  requestId(): string | null {
    return this.header("X-Request-Id");
  }

  json(): unknown {
    if (this.body === "") {
      throw new SetalabsException("Response body is empty.");
    }

    try {
      return JSON.parse(this.body) as unknown;
    } catch (error) {
      throw new SetalabsException("Response body is not valid JSON.", { cause: error });
    }
  }
}

function headerEntries(
  headers: HeaderInput,
): Iterable<readonly [string, string | readonly string[]]> {
  if (isPlainObject(headers)) {
    return Object.entries(headers);
  }
  return headers;
}
