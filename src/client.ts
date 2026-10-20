import { ErrorMapper } from "./error-mapper.js";
import { Gateway } from "./gateway.js";
import { FetchTransport } from "./http/fetch-transport.js";
import type { Transport } from "./http/transport.js";
import { isPlainObject } from "./object.js";
import { buildQuery, formatPhpFloat, encodeRfc3986, type QueryInput, type QueryMap } from "./query.js";
import type { Response } from "./response.js";
import { Signer } from "./signer.js";
import { version } from "./version.js";

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]);
const RESERVED_HEADERS = new Set(["x-api-key", "x-api-secret", "x-api-sign", "x-api-timestamp"]);

const missing = Symbol("missing");

export type HeaderValue = string | number | boolean;

export type HeaderMap = Record<string, HeaderValue>;

export interface ClientOptions {
  /** API uuid. Upper case is accepted and normalized to lower case. */
  apiUuid: string;
  /** Key id sent in `X-Api-Key`. */
  apiKey: string;
  /** Signing secret. It is never sent. An empty string leaves the request unsigned. */
  apiSecret?: string;
  /** Gateway root. Defaults to `Gateway.URL`. */
  gateway?: string | null;
  /** Request timeout in seconds. Defaults to 30. */
  timeout?: number;
  /** HTTP transport. The client creates a `FetchTransport` when this is omitted. */
  transport?: Transport;
}

export interface RequestOptions {
  query?: QueryInput;
  json?: unknown;
  body?: string;
  headers?: HeaderMap;
  /** Overrides the client timeout, in seconds. */
  timeout?: number;
}

/**
 * Calls one API published on the Setalabs gateway.
 *
 * The gateway address, API uuid, key and secret are separate: a key belongs to
 * a single API, and the secret is used only to sign the request. It is never sent.
 *
 * Construct it with an options object, or with positional arguments in the same
 * order as the PHP and Python SDKs: uuid, key, secret, gateway, timeout, transport.
 */
export class Client {
  static readonly VERSION = version;

  private gatewayUrl!: string;
  private apiUuid!: string;
  private apiKey!: string;
  private apiSecret!: string;
  private timeoutSeconds!: number;
  private transport!: Transport;
  private shareTransport!: boolean;
  private released = false;

  constructor(options: ClientOptions);
  constructor(
    apiUuid: string,
    apiKey: string,
    apiSecret?: string,
    gateway?: string | null,
    timeout?: number,
    transport?: Transport | null,
  );
  constructor(
    apiUuidOrOptions: string | ClientOptions,
    apiKey?: string,
    apiSecret = "",
    gateway: string | null = null,
    timeout = 30,
    transport: Transport | null = null,
  ) {
    const options: ClientOptions =
      typeof apiUuidOrOptions === "string"
        ? {
            apiUuid: apiUuidOrOptions,
            apiKey: apiKey ?? "",
            apiSecret,
            gateway,
            timeout,
            ...(transport != null ? { transport } : {}),
          }
        : apiUuidOrOptions;

    const created = options.transport == null ? new FetchTransport() : null;
    const resolved = created ?? options.transport;
    try {
      this.configure(
        options.apiUuid,
        options.apiKey,
        options.apiSecret ?? "",
        options.gateway ?? null,
        options.timeout ?? 30,
        resolved as Transport,
        created != null,
      );
    } catch (error) {
      created?.close();
      throw error;
    }
  }

  /**
   * Same gateway and timeout, another API.
   *
   * A key is valid only for the API it was issued for.
   */
  withApi(apiUuid: string, apiKey: string, apiSecret = ""): Client {
    return Client.create(
      apiUuid,
      apiKey,
      apiSecret,
      this.gatewayUrl,
      this.timeoutSeconds,
      this.transport,
      this.shareTransport,
    );
  }

  get(path: string, query?: QueryMap, headers?: HeaderMap): Promise<Response> {
    return this.request("GET", path, { query, headers });
  }

  post(path: string, json?: unknown, query?: QueryMap, headers?: HeaderMap): Promise<Response> {
    return this.withJson("POST", path, json, query, headers);
  }

  put(path: string, json?: unknown, query?: QueryMap, headers?: HeaderMap): Promise<Response> {
    return this.withJson("PUT", path, json, query, headers);
  }

  patch(path: string, json?: unknown, query?: QueryMap, headers?: HeaderMap): Promise<Response> {
    return this.withJson("PATCH", path, json, query, headers);
  }

  delete(path: string, json?: unknown, query?: QueryMap, headers?: HeaderMap): Promise<Response> {
    return this.withJson("DELETE", path, json, query, headers);
  }

  async request(method: string, path: string, options: RequestOptions = {}): Promise<Response> {
    if (typeof method !== "string") {
      throw new Error(`Unsupported HTTP method "${String(method)}".`);
    }
    const verb = method.toUpperCase();
    if (!METHODS.has(verb)) {
      throw new Error(`Unsupported HTTP method "${verb}".`);
    }

    const prepared = this.prepareHeaders(options.headers ?? {});
    const queryString = buildQuery(options.query ?? {});
    const decodedPath = this.decodedPath(path);
    const pathWithQuery = queryString === "" ? decodedPath : `${decodedPath}?${queryString}`;
    const payload = this.body(options, prepared);

    prepared["X-Api-Key"] = this.apiKey;
    if (this.apiSecret !== "") {
      const timestamp = String(Math.floor(Date.now() / 1000));
      prepared["X-Api-Timestamp"] = timestamp;
      prepared["X-Api-Sign"] = Signer.sign(this.apiKey, this.apiSecret, timestamp, pathWithQuery);
    }

    let url = this.gatewayUrl + this.encodePath(decodedPath);
    if (queryString !== "") {
      url += `?${queryString}`;
    }

    const timeout = this.resolveTimeout(options.timeout);
    const response = await this.transport.send(verb, url, prepared, payload, timeout);
    if (response.statusCode >= 400) {
      throw ErrorMapper.fromResponse(response);
    }
    return response;
  }

  /** Release the HTTP transport this client created. A transport you passed in is left open. */
  close(): void {
    if (this.released) {
      return;
    }
    this.released = true;
    if (this.shareTransport) {
      this.transport.release?.();
    }
  }

  private static create(
    apiUuid: string,
    apiKey: string,
    apiSecret: string,
    gateway: string | null,
    timeout: number,
    transport: Transport,
    shareTransport: boolean,
  ): Client {
    const client = Object.create(Client.prototype) as Client;
    client.configure(apiUuid, apiKey, apiSecret, gateway, timeout, transport, shareTransport);
    return client;
  }

  private configure(
    apiUuid: string,
    apiKey: string,
    apiSecret: string,
    gateway: string | null,
    timeout: number,
    transport: Transport,
    shareTransport: boolean,
  ): void {
    if (typeof apiUuid !== "string" || typeof apiKey !== "string" || typeof apiSecret !== "string") {
      throw new Error("API uuid, key and secret must be strings.");
    }
    if (transport == null) {
      throw new Error("Transport is required.");
    }

    const gatewayUrl =
      gateway == null || gateway.trim() === "" ? Gateway.URL : gateway.trim().replace(/\/+$/, "");
    this.gatewayUrl = gatewayUrl;
    this.apiUuid = apiUuid.trim().toLowerCase();
    this.apiKey = apiKey.trim();
    this.apiSecret = apiSecret.trim();
    this.timeoutSeconds = Number(timeout);
    this.transport = transport;
    this.shareTransport = shareTransport;
    this.released = false;
    this.assertConfig();
    if (shareTransport) {
      transport.acquire?.();
    }
  }

  private withJson(
    method: string,
    path: string,
    json: unknown,
    query: QueryMap | undefined,
    headers: HeaderMap | undefined,
  ): Promise<Response> {
    if (json == null) {
      return this.request(method, path, { query, headers });
    }
    return this.request(method, path, { json, query, headers });
  }

  private assertConfig(): void {
    if (!Number.isFinite(this.timeoutSeconds) || this.timeoutSeconds <= 0) {
      throw new Error("Timeout must be greater than zero.");
    }

    let parts: URL;
    try {
      parts = new URL(this.gatewayUrl);
    } catch {
      throw new Error("Gateway address must be an absolute URL, for example https://gw.setalabs.com.");
    }

    const scheme = parts.protocol.replace(/:$/, "").toLowerCase();
    if (scheme !== "http" && scheme !== "https") {
      throw new Error("Gateway address must use http or https.");
    }
    if (parts.hostname === "") {
      throw new Error("Gateway address must be an absolute URL, for example https://gw.setalabs.com.");
    }
    if (parts.pathname !== "" && parts.pathname !== "/") {
      throw new Error(
        "Gateway address must be the gateway root, without /v1/api/{uuid}. Pass the API uuid separately.",
      );
    }
    if (parts.search !== "" || parts.hash !== "") {
      throw new Error("Gateway address must not contain a query or fragment.");
    }
    if (this.apiUuid === "" || !/^[a-z0-9_-]+$/.test(this.apiUuid)) {
      throw new Error('API uuid must contain only lowercase letters, digits, "_" and "-".');
    }
    if (this.apiKey === "") {
      throw new Error("API key is required.");
    }
    assertHeaderSafe("API key", this.apiKey);
    assertHeaderSafe("API secret", this.apiSecret);
  }

  private prepareHeaders(headers: HeaderMap): Record<string, string> {
    if (!isPlainObject(headers)) {
      throw new Error("Headers must be an object.");
    }

    const normalized: Record<string, string> = {};
    for (const [name, value] of Object.entries(headers)) {
      if (name === "") {
        throw new Error("Header name must be a non-empty string.");
      }
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
        throw new Error(`Header "${name}" must be a scalar.`);
      }
      if (RESERVED_HEADERS.has(name.toLowerCase())) {
        continue;
      }
      const text = headerText(value);
      assertHeaderSafe(`Header "${name}"`, text);
      normalized[name] = text;
    }
    if (!hasHeader(normalized, "Accept")) {
      normalized.Accept = "application/json";
    }
    if (!hasHeader(normalized, "User-Agent")) {
      normalized["User-Agent"] = `setalabs-js-sdk/${Client.VERSION}`;
    }
    return normalized;
  }

  private body(options: RequestOptions, headers: Record<string, string>): string | null {
    const hasJson = Object.prototype.hasOwnProperty.call(options, "json");
    const hasBody = Object.prototype.hasOwnProperty.call(options, "body");
    if (hasJson && hasBody) {
      throw new Error("Pass either json or body, not both.");
    }
    if (hasJson) {
      if (!hasHeader(headers, "Content-Type")) {
        headers["Content-Type"] = "application/json";
      }
      return encodeJson(options.json);
    }
    if (hasBody) {
      if (typeof options.body !== "string") {
        throw new Error("Body must be a string.");
      }
      return options.body;
    }
    return null;
  }

  private resolveTimeout(timeout: number | undefined): number {
    if (timeout === undefined) {
      return this.timeoutSeconds;
    }
    const value = Number(timeout);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error("Timeout must be greater than zero.");
    }
    return value;
  }

  private decodedPath(path: string): string {
    if (typeof path !== "string") {
      throw new Error("Path must be a string.");
    }
    const trimmed = path.trim();
    if (trimmed.includes("?") || trimmed.includes("#")) {
      throw new Error("Pass query parameters separately from the path.");
    }
    const relative = trimmed === "" || trimmed === "/" ? "" : `/${trimmed.replace(/^\/+/, "")}`;
    return `${Gateway.API_PREFIX}/${this.apiUuid}${relative}`;
  }

  private encodePath(decodedPath: string): string {
    return decodedPath
      .split("/")
      .map((segment) => (segment === "" ? "" : encodeRfc3986(segment)))
      .join("/");
  }
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const target = name.toLowerCase();
  return Object.keys(headers).some((header) => header.toLowerCase() === target);
}

function assertHeaderSafe(label: string, value: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`${label} must not contain line breaks.`);
  }
}

function headerText(value: HeaderValue): string {
  if (typeof value === "boolean") {
    return value ? "1" : "";
  }
  if (typeof value === "number") {
    return formatPhpFloat(value);
  }
  return value;
}

function encodeJson(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (containsNonFinite(value)) {
    throw new Error("JSON body could not be encoded.");
  }
  try {
    const encoded = JSON.stringify(value);
    if (typeof encoded !== "string") {
      throw new Error("JSON body could not be encoded.");
    }
    return encoded;
  } catch (error) {
    if (error instanceof Error && error.message === "JSON body could not be encoded.") {
      throw error;
    }
    throw new Error("JSON body could not be encoded.", { cause: error });
  }
}

function containsNonFinite(value: unknown): boolean {
  if (typeof value === "number") {
    return !Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsNonFinite(item));
  }
  if (isPlainObject(value)) {
    return Object.values(value).some((item) => containsNonFinite(item));
  }
  return false;
}
