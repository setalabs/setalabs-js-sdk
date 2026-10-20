import { ErrorCode } from "./error-code.js";
import {
  ApiException,
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  RateLimitException,
  ServerException,
  TooManyRequestsException,
  UnauthorizedException,
  UsageLimitException,
  ValidationException,
} from "./exceptions.js";
import { isPlainObject } from "./object.js";
import type { Response } from "./response.js";

const BY_ERROR: Record<string, typeof ApiException> = {
  [ErrorCode.BAD_REQUEST]: BadRequestException,
  [ErrorCode.UNAUTHORIZED]: UnauthorizedException,
  [ErrorCode.FORBIDDEN]: ForbiddenException,
  [ErrorCode.NOT_FOUND]: NotFoundException,
  [ErrorCode.VALIDATION_ERROR]: ValidationException,
  [ErrorCode.RATE_LIMITED]: RateLimitException,
  [ErrorCode.USAGE_LIMIT_EXCEEDED]: UsageLimitException,
  [ErrorCode.BAD_GATEWAY]: BadGatewayException,
  [ErrorCode.INTERNAL_ERROR]: ServerException,
};

const BY_STATUS: Record<number, typeof ApiException> = {
  400: BadRequestException,
  401: UnauthorizedException,
  403: ForbiddenException,
  404: NotFoundException,
  422: ValidationException,
  429: TooManyRequestsException,
  500: ServerException,
  502: BadGatewayException,
  503: BadGatewayException,
  504: BadGatewayException,
};

export class ErrorMapper {
  private constructor() {
    throw new TypeError("ErrorMapper is not instantiable.");
  }

  static fromResponse(response: Response): ApiException {
    const payload = readPayload(response);
    let error = "";
    let reason: string | null = null;
    let missingFields: string[] = [];
    if (payload !== null) {
      if ("error" in payload && payload.error != null) {
        error = asText(payload.error);
      }
      if ("reason" in payload && payload.reason != null) {
        reason = asText(payload.reason);
      }
      missingFields = readMissingFields(payload.missing_fields);
    }

    let message: string;
    if (reason) {
      message = reason;
    } else if (error) {
      message = error;
    } else {
      message = `HTTP ${response.statusCode}`;
    }
    if (missingFields.length > 0) {
      message += ` Missing: ${missingFields.join(", ")}.`;
    }

    const exceptionType = BY_ERROR[error] ?? BY_STATUS[response.statusCode] ?? ApiException;
    return new exceptionType(
      message,
      response.statusCode,
      error,
      reason,
      response.requestId(),
      missingFields,
      retryAfter(response, payload),
      response,
    );
  }
}

function readPayload(response: Response): Record<string, unknown> | null {
  if (response.body === "") {
    return null;
  }

  try {
    const decoded: unknown = JSON.parse(response.body);
    return isPlainObject(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

function readMissingFields(value: unknown): string[] {
  const items = Array.isArray(value) ? value : isPlainObject(value) ? Object.values(value) : [];
  return items.filter((field): field is string => typeof field === "string" && field !== "");
}

function retryAfter(response: Response, payload: Record<string, unknown> | null): number | null {
  if (payload !== null && "retry_after" in payload) {
    const parsed = coerceInt(payload.retry_after);
    if (parsed !== null) {
      return parsed;
    }
  }

  return coerceInt(response.header("Retry-After"));
}

function coerceInt(value: unknown): number | null {
  if (typeof value === "boolean" || value == null) {
    return null;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (text === "") {
      return null;
    }
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return Math.trunc(parsed);
  }
  return null;
}

function asText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "1" : "";
  }
  if (value == null) {
    return "";
  }
  return String(value);
}
