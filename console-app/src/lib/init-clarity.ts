import Clarity from "@microsoft/clarity";

/** Initialize Microsoft Clarity when VITE_CLARITY_PROJECT_ID is set. */
export function initClarity(): void {
  const projectId = import.meta.env.VITE_CLARITY_PROJECT_ID?.trim();
  if (!projectId) {
    return;
  }

  Clarity.init(projectId);
}
