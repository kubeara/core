export const DEPLOYMENT_VALIDATION_IN_PROGRESS_MESSAGE =
  "Validating server configuration...";

export const DEPLOYMENT_RESOURCE_WARNING_CONFIRM_TITLE =
  "Insufficient server resources";

export const DEPLOYMENT_RESOURCE_WARNING_CONFIRM_BUTTON =
  "Continue";

export function getDeploymentResourceWarningMessage(
  code: "insufficient_ram" | "insufficient_cpu",
): string {
  if (code === "insufficient_cpu") {
    return "Server does not have enough CPU to safely run this service. Do you still want to continue deployment?";
  }

  return "Server does not have enough RAM to safely run this service. Do you still want to continue deployment?";
}
