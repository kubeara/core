import { describe, it, expect } from "@jest/globals";

import { normalizeServerHostForUrls } from "./deployment-server.util";

describe("deployment-server.util", () => {
  it("normalizeServerHostForUrls strips scheme and port", () => {
    expect(normalizeServerHostForUrls("http://203.0.113.10:3000")).toBe(
      "203.0.113.10",
    );
    expect(normalizeServerHostForUrls("127.0.0.1")).toBe("127.0.0.1");
  });
});
