export const CUSTOM_COMPOSE_STEPS = [
  {
    value: "upload",
    title: "Upload Compose",
    description: "Name and compose file",
  },
  {
    value: "environment",
    title: "Configure Environment",
    description: "Services and variables",
  },
  {
    value: "server",
    title: "Select Server",
    description: "Choose a target",
  },
  {
    value: "review",
    title: "Review & Deploy",
    description: "Confirm configuration",
  },
] as const;

export type CustomComposeStepValue =
  (typeof CUSTOM_COMPOSE_STEPS)[number]["value"];
