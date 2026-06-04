import { mergeDiscoveredContainersWithDeployments } from "./container-discovery.util";
import { ManagedType } from "../enums/managed-type.enum";

describe("mergeDiscoveredContainersWithDeployments", () => {
  const deployments = [
    {
      id: "deployment-abc",
      templateSlug: "postgresql",
      composeProject: "deploymentabc",
    },
    {
      id: "deployment-offline",
      templateSlug: "redis",
      composeProject: "deploymentoffline",
    },
  ];

  it("classifies kubeara managed containers by compose project", () => {
    const result = mergeDiscoveredContainersWithDeployments(
      [
        {
          containerId: "id1",
          containerName: "/deploymentabc-postgres-1",
          imageName: "postgres:16",
          status: "Up 2 hours",
          ports: "5432/tcp",
          runningSince: "2 hours ago",
          composeProject: "deploymentabc",
        },
      ],
      deployments,
      "server-1",
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      managedType: ManagedType.KUBEARA_MANAGED,
      deploymentId: "deployment-abc",
      templateId: "postgresql",
      isOnline: true,
    });
    expect(result[1]).toMatchObject({
      managedType: ManagedType.KUBEARA_MANAGED,
      deploymentId: "deployment-offline",
      isOnline: false,
      status: "offline",
    });
  });

  it("classifies unmatched containers as self managed", () => {
    const result = mergeDiscoveredContainersWithDeployments(
      [
        {
          containerId: "id9",
          containerName: "/custom-app",
          imageName: "nginx:latest",
          status: "Up 1 minute",
          ports: "80/tcp",
          runningSince: "1 minute ago",
        },
      ],
      [],
      "server-1",
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      managedType: ManagedType.SELF_MANAGED,
      deploymentId: null,
      isOnline: true,
    });
  });

  it("sorts online kubeara, online self, then offline kubeara", () => {
    const result = mergeDiscoveredContainersWithDeployments(
      [
        {
          containerId: "self",
          containerName: "/self",
          imageName: "nginx",
          status: "Up",
          ports: "",
          runningSince: "",
        },
        {
          containerId: "kub",
          containerName: "/deploymentabc-db-1",
          imageName: "postgres",
          status: "Up",
          ports: "",
          runningSince: "",
          composeProject: "deploymentabc",
        },
      ],
      deployments,
      "server-1",
    );

    expect(result[0].managedType).toBe(ManagedType.KUBEARA_MANAGED);
    expect(result[0].isOnline).toBe(true);
    expect(result[1].managedType).toBe(ManagedType.SELF_MANAGED);
    expect(result[2].isOnline).toBe(false);
  });
});
