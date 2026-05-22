import { describe, it, expect } from "@jest/globals";

import {
  buildServiceSubdomain,
  generateServiceFqdn,
  generateServiceUrl,
  generateServiceUrlFqdnPairs,
  parseServiceEnvironmentVariable,
  sslipWildcard,
} from "./server-url.util";

describe("server-url.util", () => {
  const context = {
    publicIp: "192.168.1.100",
    deploymentId: "deployment-1234567890-abc",
  };

  it("builds sslip wildcard from server IP", () => {
    expect(sslipWildcard("192.168.1.100")).toBe(
      "http://192.168.1.100.sslip.io",
    );
    expect(sslipWildcard("127.0.0.1")).toBe("http://127.0.0.1.sslip.io");
  });

  it("parses SERVICE_URL_N8N_5678", () => {
    expect(parseServiceEnvironmentVariable("SERVICE_URL_N8N_5678")).toEqual({
      serviceName: "n8n",
      preservedName: "N8N",
      port: "5678",
      hasPort: true,
    });
  });

  it("generates Coolify-style URL and FQDN pairs", () => {
    const subdomain = buildServiceSubdomain("N8N", context.deploymentId);
    expect(subdomain).toBe("n8n-1234567890-abc");

    const url = generateServiceUrl(context, subdomain);
    expect(url).toBe("http://n8n-1234567890-abc.192.168.1.100.sslip.io");

    const fqdn = generateServiceFqdn(context, subdomain);
    expect(fqdn).toBe("n8n-1234567890-abc.192.168.1.100.sslip.io");

    const pairs = generateServiceUrlFqdnPairs("SERVICE_URL_N8N_5678", context);
    expect(pairs.SERVICE_URL_N8N).toBe(url);
    expect(pairs.SERVICE_FQDN_N8N).toBe(fqdn);
    expect(pairs.SERVICE_URL_N8N_5678).toBe(`${url}:5678`);
    expect(pairs.SERVICE_FQDN_N8N_5678).toBe(`${fqdn}:5678`);
  });
});
