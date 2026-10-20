import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/error-code.js";
import { ErrorMapper } from "../src/error-mapper.js";
import {
  ApiException,
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  RateLimitException,
  ServerException,
  UnauthorizedException,
  UsageLimitException,
  ValidationException,
} from "../src/exceptions.js";
import { Response } from "../src/response.js";

function jsonBody(error: string, reason: string | null): string {
  const payload: Record<string, string> = { error };
  if (reason !== null) {
    payload.reason = reason;
  }
  return JSON.stringify(payload);
}

const cases: Array<[number, string, typeof ApiException, string]> = [
  [400, jsonBody(ErrorCode.BAD_REQUEST, "API has no base URL."), BadRequestException, "API has no base URL."],
  [401, jsonBody(ErrorCode.UNAUTHORIZED, "Missing API key."), UnauthorizedException, "Missing API key."],
  [401, jsonBody(ErrorCode.UNAUTHORIZED, "Invalid API key."), UnauthorizedException, "Invalid API key."],
  [401, jsonBody(ErrorCode.UNAUTHORIZED, "Missing API signature."), UnauthorizedException, "Missing API signature."],
  [401, jsonBody(ErrorCode.UNAUTHORIZED, "Missing API timestamp."), UnauthorizedException, "Missing API timestamp."],
  [401, jsonBody(ErrorCode.UNAUTHORIZED, "Invalid API signature."), UnauthorizedException, "Invalid API signature."],
  [403, jsonBody(ErrorCode.FORBIDDEN, "API key is blocked."), ForbiddenException, "API key is blocked."],
  [
    403,
    jsonBody(ErrorCode.FORBIDDEN, "API key subscription has expired."),
    ForbiddenException,
    "API key subscription has expired.",
  ],
  [
    403,
    jsonBody(ErrorCode.FORBIDDEN, "API key has no active tariff."),
    ForbiddenException,
    "API key has no active tariff.",
  ],
  [
    403,
    jsonBody(ErrorCode.FORBIDDEN, "API key is not valid for this API."),
    ForbiddenException,
    "API key is not valid for this API.",
  ],
  [404, jsonBody(ErrorCode.NOT_FOUND, "API not found."), NotFoundException, "API not found."],
  [404, jsonBody(ErrorCode.NOT_FOUND, "API endpoint not found."), NotFoundException, "API endpoint not found."],
  [404, jsonBody(ErrorCode.NOT_FOUND, null), NotFoundException, ErrorCode.NOT_FOUND],
  [502, jsonBody(ErrorCode.BAD_GATEWAY, "Upstream API is unavailable."), BadGatewayException, "Upstream API is unavailable."],
  [503, jsonBody(ErrorCode.BAD_GATEWAY, "Upstream API is unavailable."), BadGatewayException, "Upstream API is unavailable."],
  [500, jsonBody(ErrorCode.INTERNAL_ERROR, ""), ServerException, ErrorCode.INTERNAL_ERROR],
];

describe("ErrorMapper", () => {
  it.each(cases)("maps HTTP %s", (statusCode, body, expectedType, expectedMessage) => {
    const exception = ErrorMapper.fromResponse(new Response(statusCode, { "X-Request-Id": "abc123" }, body));

    expect(exception).toBeInstanceOf(expectedType);
    expect(exception.message).toBe(expectedMessage);
    expect(exception.statusCode).toBe(statusCode);
    expect(exception.requestId).toBe("abc123");
  });

  it("includes missing fields on a validation error", () => {
    const exception = ErrorMapper.fromResponse(
      new Response(
        422,
        {},
        JSON.stringify({
          error: ErrorCode.VALIDATION_ERROR,
          reason: "Required fields are missing.",
          missing_fields: ["page", "limit"],
        }),
      ),
    );

    expect(exception).toBeInstanceOf(ValidationException);
    expect(exception.missingFields).toEqual(["page", "limit"]);
    expect(exception.message).toBe("Required fields are missing. Missing: page, limit.");
  });

  it("reads missing fields from an object", () => {
    const exception = ErrorMapper.fromResponse(
      new Response(
        422,
        {},
        JSON.stringify({
          error: ErrorCode.VALIDATION_ERROR,
          reason: "Required fields are missing.",
          missing_fields: { a: "page", b: "" },
        }),
      ),
    );

    expect(exception.missingFields).toEqual(["page"]);
  });

  it("reads retry_after for a rate limit", () => {
    const exception = ErrorMapper.fromResponse(
      new Response(
        429,
        { "Retry-After": "3", "X-RateLimit-Limit": "10" },
        JSON.stringify({ error: ErrorCode.RATE_LIMITED, retry_after: 3 }),
      ),
    );

    expect(exception).toBeInstanceOf(RateLimitException);
    expect(exception.retryAfter).toBe(3);
  });

  it("maps a usage limit", () => {
    const exception = ErrorMapper.fromResponse(
      new Response(
        429,
        {},
        JSON.stringify({ error: ErrorCode.USAGE_LIMIT_EXCEEDED, reason: "Request limit exceeded." }),
      ),
    );

    expect(exception).toBeInstanceOf(UsageLimitException);
    expect(exception.message).toBe("Request limit exceeded.");
    expect(exception.retryAfter).toBeNull();
  });

  it("uses the status when the body is not a gateway payload", () => {
    const exception = ErrorMapper.fromResponse(new Response(418, {}, "nope"));

    expect(exception).toBeInstanceOf(ApiException);
    expect(exception.message).toBe("HTTP 418");
    expect(exception.error).toBe("");
  });

  it("falls back to the Retry-After header", () => {
    const exception = ErrorMapper.fromResponse(
      new Response(429, { "Retry-After": "3.9" }, JSON.stringify({ error: ErrorCode.RATE_LIMITED })),
    );

    expect(exception.retryAfter).toBe(3);
  });
});
