# Setalabs JavaScript SDK

Client for the Setalabs gateway. Each API has its own uuid, key, and set of endpoints. The gateway address is shared.

The key secret is used only to sign requests. It is never sent.

The package is written in TypeScript and ships its declarations. The same import works from JavaScript and from TypeScript. It runs on Node.js 18 or newer.

## Installation

```bash
npm install @setalabs/sdk
```

Until the package is published, install it from a local path. From this directory:

```bash
npm install
npm run build
```

Then, in the application:

```bash
npm install ../setalabs-js-sdk
```

## Requests

The default gateway address is `Gateway.URL` (`https://gw.setalabs.com`). Pass `gateway` to use another one. An OpenAPI server URL already includes the API uuid; this SDK takes the uuid separately.

```js
import { Client } from "@setalabs/sdk";

const client = new Client({
  apiUuid: "05141812-7772-403e-9ca6-5e8e8bf22730",
  apiKey: "your-key",
  apiSecret: "your-secret",
});

const local = new Client({
  apiUuid: "05141812-7772-403e-9ca6-5e8e8bf22730",
  apiKey: "your-key",
  apiSecret: "your-secret",
  gateway: "http://localhost:8080",
});

const response = await client.get("/catalog", { language: "en" });
const data = response.json();
```

The same constructor accepts positional arguments, in the same order as the PHP and Python SDKs:

```js
const client = new Client(
  "05141812-7772-403e-9ca6-5e8e8bf22730",
  "your-key",
  "your-secret",
);
```

The path is the endpoint path from the OpenAPI document (`/catalog`, `/product/{id}`, `/search`), without the `/v1/api/{uuid}` prefix. Substitute path parameters yourself: `/product/12345`.

Another API on the same gateway:

```js
const other = client.withApi("another-api-uuid", "other-key", "other-secret");
```

If the key has no secret, pass an empty string. The request is not signed.

```js
await client.post("/orders", { sku: "A1" });
await client.request("PUT", "/orders/1", {
  json: { status: "paid" },
  query: { language: "en" },
  timeout: 10,
});
```

Every call returns a promise. A successful response is the upstream body and status, unchanged. The gateway returns the request id in `X-Request-Id`:

```js
response.statusCode;
response.requestId();
response.json();
```

Call `close()` when the client is no longer needed. Clients created with `withApi()` share one transport, and that transport rejects further requests after every one of those clients has been closed. A transport you passed into the constructor stays open.

```js
client.close();
```

## Signature

When a secret is set, every request includes:

- `X-Api-Key`
- `X-Api-Timestamp` — Unix time in seconds
- `X-Api-Sign` — `HMAC-SHA256(key + secret + timestamp + path?query, secret)`, lowercase hex

`path?query` is the path the gateway sees, plus the raw query string. For example: `/v1/api/{uuid}/catalog?language=en`. Parameter order is preserved. The query string uses the same encoding as PHP `http_build_query` with `PHP_QUERY_RFC3986`.

## Errors

A response with status 400 or higher throws an exception. The message comes from the gateway `reason`. Every API error exposes `statusCode`, `error`, `reason`, `requestId`, `missingFields`, `retryAfter`, and the original `response`.

| HTTP | `error` | Exception | When |
| --- | --- | --- | --- |
| 400 | `bad_request` | `BadRequestException` | The API has no base URL |
| 401 | `unauthorized` | `UnauthorizedException` | Missing or invalid key, missing or invalid signature, missing timestamp |
| 403 | `forbidden` | `ForbiddenException` | Key is blocked, subscription has expired, no active tariff, or the key belongs to another API |
| 404 | `not_found` | `NotFoundException` | API or endpoint was not found |
| 422 | `validation_error` | `ValidationException` | Required fields are missing; names are in `missingFields` |
| 429 | `rate_limited` | `RateLimitException` | Plan RPS limit exceeded; wait `retryAfter` seconds |
| 429 | `usage_limit_exceeded` | `UsageLimitException` | Call quota for the period is exhausted |
| 500 | `internal_error` | `ServerException` | Gateway internal error |
| 502 | `bad_gateway` | `BadGatewayException` | Upstream is unavailable |

Statuses 503 and 504 are also `BadGatewayException`. Any other 429 is `TooManyRequestsException`.

A network failure throws `TransportException`. `SetalabsException` is the base type for gateway and transport errors. Invalid client arguments throw `Error`.

```js
import { ApiException, RateLimitException, ValidationException } from "@setalabs/sdk";

try {
  const data = (await client.get("/search", { text: "phone", page: 1, limit: 24 })).json();
} catch (error) {
  if (error instanceof ValidationException) {
    error.missingFields;
  } else if (error instanceof RateLimitException) {
    await new Promise((resolve) => setTimeout(resolve, (error.retryAfter ?? 1) * 1000));
  } else if (error instanceof ApiException) {
    error.statusCode;
    error.reason;
    error.requestId;
  }
}
```

CommonJS:

```js
const { Client } = require("@setalabs/sdk");
```
