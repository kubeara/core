import { deriveLastRestartedFromDockerStatus } from "./parse-docker-ps.util";

describe("deriveLastRestartedFromDockerStatus", () => {
  it("parses running container uptime from status", () => {
    expect(deriveLastRestartedFromDockerStatus("Up 6 hours (healthy)")).toBe(
      "6 hour ago",
    );
    expect(deriveLastRestartedFromDockerStatus("Up 2 days")).toBe("2 day ago");
    expect(deriveLastRestartedFromDockerStatus("Up About a minute")).toBe(
      "1 min ago",
    );
  });

  it("parses restarting container status", () => {
    expect(
      deriveLastRestartedFromDockerStatus("Restarting (5 seconds ago)"),
    ).toBe("5 sec ago");
  });

  it("returns empty for exited or created containers", () => {
    expect(deriveLastRestartedFromDockerStatus("Exited (0) 2 hours ago")).toBe(
      "",
    );
    expect(deriveLastRestartedFromDockerStatus("Created")).toBe("");
    expect(deriveLastRestartedFromDockerStatus("")).toBe("");
  });
});
