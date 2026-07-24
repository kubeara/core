import { DeploymentStatus } from "@/constants/deployment-events";

/**
 * Returns true when a live socket status event transitions into success.
 * Ignores duplicate success events and REST/query-only success on page load.
 */
export function shouldCelebrateDeploymentSuccess(
  deploymentId: string | undefined,
  hasReceivedStatus: boolean,
  deploymentStatus: DeploymentStatus | null,
  previousSocketStatus: DeploymentStatus | null,
  celebratedDeploymentId: string | null,
): boolean {
  if (!deploymentId || !hasReceivedStatus || !deploymentStatus) {
    return false;
  }

  if (deploymentStatus !== DeploymentStatus.SUCCESS) {
    return false;
  }

  if (previousSocketStatus === DeploymentStatus.SUCCESS) {
    return false;
  }

  if (celebratedDeploymentId === deploymentId) {
    return false;
  }

  return true;
}
