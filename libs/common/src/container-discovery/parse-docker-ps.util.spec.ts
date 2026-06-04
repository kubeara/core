import {
  parseComposeProjectFromLabels,
  parseDockerPsStdout,
} from "./parse-docker-ps.util";

describe("parseDockerPsStdout", () => {
  it("parses docker ps json lines", () => {
    const stdout = [
      JSON.stringify({
        ID: "abc123",
        Names: "my-app-1",
        Image: "nginx:alpine",
        Status: "Up 2 hours",
        Ports: "80/tcp",
        RunningFor: "2 hours ago",
        Labels:
          "com.docker.compose.project=myproject,com.docker.compose.service=web",
      }),
    ].join("\n");

    const containers = parseDockerPsStdout(stdout);
    expect(containers).toHaveLength(1);
    expect(containers[0]).toMatchObject({
      containerId: "abc123",
      containerName: "my-app-1",
      imageName: "nginx:alpine",
      composeProject: "myproject",
    });
  });
});

describe("parseComposeProjectFromLabels", () => {
  it("extracts compose project label", () => {
    expect(
      parseComposeProjectFromLabels(
        "com.docker.compose.project=deploymentabc,com.docker.compose.service=db",
      ),
    ).toBe("deploymentabc");
  });
});
