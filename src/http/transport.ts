import type { Response } from "../response.js";

export interface Transport {
  send(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | null,
    timeout: number,
  ): Promise<Response>;

  /** Called when a client starts sharing this transport. */
  acquire?(): void;

  /** Called when a client that shares this transport is closed. */
  release?(): void;

  close?(): void;
}
