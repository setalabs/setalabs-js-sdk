import { createHmac } from "node:crypto";

/**
 * Request signature expected by the gateway.
 *
 * `X-Api-Sign` is HMAC-SHA256 of `apiKey + secret + timestamp + pathWithQuery`,
 * keyed by the secret, as lowercase hex. `pathWithQuery` is the decoded request
 * path plus the raw query string, for example `/v1/api/{uuid}/items?page=1`.
 */
export class Signer {
  private constructor() {
    throw new TypeError("Signer is not instantiable.");
  }

  static sign(apiKey: string, secret: string, timestamp: string, pathWithQuery: string): string {
    const message = `${apiKey}${secret}${timestamp}${pathWithQuery}`;
    return createHmac("sha256", secret).update(message, "utf8").digest("hex");
  }
}
