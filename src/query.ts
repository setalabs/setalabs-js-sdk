/**
 * Query strings compatible with PHP `http_build_query(..., PHP_QUERY_RFC3986)`.
 *
 * The gateway signs the raw query string, so parameter order and encoding have to
 * match the PHP SDK.
 */

import { isPlainObject } from "./object.js";

const PRECISION = 14;

export type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | QueryValue[]
  | { [key: string]: QueryValue };

export type QueryMap = { [key: string]: QueryValue };

export type QueryInput = string | QueryMap;

export function buildQuery(query: QueryInput): string {
  if (typeof query === "string") {
    return query.replace(/^\?+/, "");
  }
  if (!isPlainObject(query)) {
    throw new Error("Query must be a string or an object.");
  }

  const pairs: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(query)) {
    const name = parameterName(key);
    if (value == null) {
      continue;
    }
    if (!isQueryValue(value)) {
      throw new Error(`Query parameter "${name}" must be a scalar or a list.`);
    }
    append(pairs, name, value);
  }

  if (pairs.length === 0) {
    return "";
  }

  return pairs.map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`).join("&");
}

/** String cast of a float, using PHP's default `precision=14` (`zend_gcvt`). */
export function formatPhpFloat(value: number): string {
  if (Number.isNaN(value)) {
    return "NAN";
  }
  if (value === Number.POSITIVE_INFINITY) {
    return "INF";
  }
  if (value === Number.NEGATIVE_INFINITY) {
    return "-INF";
  }

  const negative = Object.is(value, -0) || value < 0;
  if (value === 0) {
    return negative ? "-0" : "0";
  }

  const [digits, decpt] = significantDigits(Math.abs(value), PRECISION);
  return gcvt(negative, digits, decpt, PRECISION);
}

/** Encode a string the way PHP `rawurlencode` does (`RFC 3986`). */
export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function parameterName(key: string): string {
  if (key === "") {
    throw new Error("Query parameter name must not be empty.");
  }
  return key;
}

function isQueryValue(value: unknown): value is Exclude<QueryValue, null | undefined> {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    Array.isArray(value) ||
    isPlainObject(value)
  );
}

function append(pairs: Array<[string, string]>, key: string, value: unknown): void {
  if (value == null) {
    return;
  }
  if (typeof value === "boolean") {
    pairs.push([key, value ? "1" : "0"]);
    return;
  }
  if (typeof value === "number") {
    pairs.push([key, formatPhpFloat(value)]);
    return;
  }
  if (typeof value === "string") {
    pairs.push([key, value]);
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      append(pairs, `${key}[${index}]`, value[index]);
    }
    return;
  }
  if (isPlainObject(value)) {
    for (const [subkey, item] of Object.entries(value)) {
      append(pairs, `${key}[${parameterName(subkey)}]`, item);
    }
    return;
  }
  throw new Error(`Query parameter "${key}" must be a scalar or a list.`);
}

function significantDigits(value: number, precision: number): [string, number] {
  const text = value.toExponential(precision - 1);
  const separator = text.indexOf("e");
  const mantissa = text.slice(0, separator);
  const exponent = Number.parseInt(text.slice(separator + 1), 10);
  const dot = mantissa.indexOf(".");
  const whole = dot === -1 ? mantissa : mantissa.slice(0, dot);
  const fraction = dot === -1 ? "" : mantissa.slice(dot + 1);
  const digits = `${whole}${fraction}`.replace(/0+$/, "") || "0";
  return [digits, exponent + 1];
}

/** PHP `zend_gcvt` for an already rounded digit string. */
function gcvt(negative: boolean, digits: string, decpt: number, ndigit: number): string {
  const sign = negative ? "-" : "";

  if ((decpt >= 0 && decpt > ndigit) || decpt < -3) {
    const exponent = decpt - 1;
    const exponentSign = exponent >= 0 ? "+" : "-";
    const fraction = digits.length > 1 ? digits.slice(1) : "0";
    return `${sign}${digits[0]}.${fraction}E${exponentSign}${Math.abs(exponent)}`;
  }

  if (decpt <= 0) {
    return `${sign}0.${"0".repeat(-decpt)}${digits}`;
  }

  if (digits.length <= decpt) {
    return `${sign}${digits}${"0".repeat(decpt - digits.length)}`;
  }

  return `${sign}${digits.slice(0, decpt)}.${digits.slice(decpt)}`;
}
