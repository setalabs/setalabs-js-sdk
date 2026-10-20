import type { Transport } from "../src/http/transport.js";
import { Response } from "../src/response.js";

export interface RecordedCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  timeout: number;
}

export class RecordingTransport implements Transport {
  readonly calls: RecordedCall[] = [];

  constructor(private readonly response: Response) {}

  async send(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | null,
    timeout: number,
  ): Promise<Response> {
    this.calls.push({ method, url, headers, body, timeout });
    return this.response;
  }
}
