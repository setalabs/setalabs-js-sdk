import type { Response } from "./response.js";

/** Base type for gateway and transport errors. */
export class SetalabsException extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The request did not receive an HTTP response. */
export class TransportException extends SetalabsException {}

/** A gateway or upstream response with status 400 or higher. */
export class ApiException extends SetalabsException {
  readonly statusCode: number;
  readonly error: string;
  readonly reason: string | null;
  readonly requestId: string | null;
  readonly missingFields: string[];
  readonly retryAfter: number | null;
  readonly response: Response | null;

  constructor(
    message: string,
    statusCode: number,
    error: string,
    reason: string | null = null,
    requestId: string | null = null,
    missingFields: readonly string[] = [],
    retryAfter: number | null = null,
    response: Response | null = null,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.error = error;
    this.reason = reason;
    this.requestId = requestId;
    this.missingFields = [...missingFields];
    this.retryAfter = retryAfter;
    this.response = response;
  }
}

/** The API has no base URL, or the gateway rejected the request. */
export class BadRequestException extends ApiException {}

/** Missing or invalid key, signature, or timestamp. */
export class UnauthorizedException extends ApiException {}

/** The key is blocked, expired, without a tariff, or belongs to another API. */
export class ForbiddenException extends ApiException {}

/** The API or endpoint was not found. */
export class NotFoundException extends ApiException {}

/** Required fields are missing. Their names are in `missingFields`. */
export class ValidationException extends ApiException {}

/** The gateway refused the call because of a limit. Status is 429. */
export class TooManyRequestsException extends ApiException {}

/** Plan RPS limit exceeded. Wait `retryAfter` seconds. */
export class RateLimitException extends TooManyRequestsException {}

/** Call quota for the period is exhausted. */
export class UsageLimitException extends TooManyRequestsException {}

/** Gateway internal error. */
export class ServerException extends ApiException {}

/** Upstream is unavailable. */
export class BadGatewayException extends ApiException {}
