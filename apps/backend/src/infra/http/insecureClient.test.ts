import { describe, it, expect } from "vitest";
import { createInsecureHttpClient } from "./insecureClient.js";

describe("createInsecureHttpClient", () => {
  it("builds an HttpClient", () => {
    const client = createInsecureHttpClient();
    expect(typeof client.send).toBe("function");
    // The TLS-permissive behavior (accepting a self-signed peer cert) is a
    // property of the underlying undici Agent's connect options; no TLS server
    // with a self-signed cert is spun up in unit tests (cf. pinnedClient.test).
    // The wiring that opts a Homebridge instance into this client is covered by
    // registerServices.test.ts.
  });
});
