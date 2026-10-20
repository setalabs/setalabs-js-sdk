/** JavaScript and TypeScript client for the Setalabs API gateway. */

export { Client } from "./client.js";
export type { ClientOptions, HeaderMap, HeaderValue, RequestOptions } from "./client.js";
export { ErrorCode } from "./error-code.js";
export { ErrorMapper } from "./error-mapper.js";
export {
  ApiException,
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  RateLimitException,
  ServerException,
  SetalabsException,
  TooManyRequestsException,
  TransportException,
  UnauthorizedException,
  UsageLimitException,
  ValidationException,
} from "./exceptions.js";
export { Gateway } from "./gateway.js";
export { FetchTransport } from "./http/fetch-transport.js";
export type { FetchLike } from "./http/fetch-transport.js";
export type { Transport } from "./http/transport.js";
export { buildQuery, formatPhpFloat } from "./query.js";
export type { QueryInput, QueryMap, QueryValue } from "./query.js";
export { Response } from "./response.js";
export type { HeaderInput } from "./response.js";
export { Signer } from "./signer.js";
export { version } from "./version.js";
