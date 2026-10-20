/** Shared gateway address. Each API is selected by its own uuid. */
export class Gateway {
  static readonly URL = "https://gw.setalabs.com";
  static readonly API_PREFIX = "/v1/api";

  private constructor() {
    throw new TypeError("Gateway is not instantiable.");
  }
}
