import { resolveControlPanelUrl } from "./control-panel-url.util";

describe("resolveControlPanelUrl", () => {
  afterEach(() => {
    delete process.env.SERVICE_PORT_KUBEARA;
  });

  it("prefers an explicitly configured URL", () => {
    expect(resolveControlPanelUrl("https://panel.example.com", "15501")).toBe(
      "https://panel.example.com",
    );
  });

  it("strips trailing slashes from configured URLs", () => {
    expect(resolveControlPanelUrl("http://host:3000///")).toBe(
      "http://host:3000",
    );
  });

  it("derives localhost URL from SERVICE_PORT_KUBEARA argument", () => {
    expect(resolveControlPanelUrl(null, "15501")).toBe(
      "http://localhost:15501",
    );
    expect(resolveControlPanelUrl(undefined, 15002)).toBe(
      "http://localhost:15002",
    );
  });

  it("falls back to process.env.SERVICE_PORT_KUBEARA when no arg", () => {
    process.env.SERVICE_PORT_KUBEARA = "16001";
    expect(resolveControlPanelUrl("", null)).toBe("http://localhost:16001");
  });

  it("defaults to 9461 when nothing is set or port is invalid", () => {
    expect(resolveControlPanelUrl()).toBe("http://localhost:9461");
    expect(resolveControlPanelUrl(null, "not-a-port")).toBe(
      "http://localhost:9461",
    );
    expect(resolveControlPanelUrl(undefined, "70000")).toBe(
      "http://localhost:9461",
    );
    expect(resolveControlPanelUrl(null, "")).toBe("http://localhost:9461");
  });
});
