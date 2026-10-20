/** Error codes returned by the Setalabs gateway. */
export class ErrorCode {
  static readonly BAD_REQUEST = "bad_request";
  static readonly UNAUTHORIZED = "unauthorized";
  static readonly FORBIDDEN = "forbidden";
  static readonly NOT_FOUND = "not_found";
  static readonly VALIDATION_ERROR = "validation_error";
  static readonly BAD_GATEWAY = "bad_gateway";
  static readonly INTERNAL_ERROR = "internal_error";
  static readonly RATE_LIMITED = "rate_limited";
  static readonly USAGE_LIMIT_EXCEEDED = "usage_limit_exceeded";

  private constructor() {
    throw new TypeError("ErrorCode is not instantiable.");
  }
}
