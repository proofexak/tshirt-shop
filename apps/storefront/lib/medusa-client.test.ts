import { describe, expect, test } from "vitest";
import { medusa } from "./medusa-client";

describe("medusa client", () => {
  test("medusa client is configured against the backend URL", () => {
    // @medusajs/js-sdk 2.21.1's `Medusa` instance exposes no public
    // `baseUrl` accessor: the brief's literal `medusa.config.baseUrl` doesn't
    // exist on this SDK version. `client.config` is the SDK's only holder of
    // the resolved baseUrl (typed `private` on `Client`, but a real runtime
    // property), so we read it through that accessor instead of adding a
    // wrapper property just to satisfy the literal snippet.
    const { config } = medusa.client as unknown as { config: { baseUrl: string } };
    expect(config.baseUrl).toBe(process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL);
  });
});
