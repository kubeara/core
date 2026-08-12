export const SERVER_ONBOARD_LOGS = {
  SERVER_CREATED: "Server created",
  SSH_CREDENTIALS_CREATED: "SSH credentials created",
  SSH_CONNECTION_SUCCESS: "SSH connection successful",
  VALIDATION_EXECUTED: "Validation command executed",
  SSH_TEST_FAILED: "SSH test failed",
  TRANSACTION_ROLLED_BACK: "Transaction rolled back",
  DELETED_SERVER_RESTORED: "Deleted server restored",
  DELETED_SERVER_FOUND: "Deleted server found",
  SSH_VALIDATION_FAILED: "SSH validation failed",
  CREDENTIALS_MISSING_AFTER_RESTORE:
    "SSH ok but credentials missing after restore",
  AGENT_INSTALL_SKIPPED: "Agent install skipped (installAgent=false)",
  AGENT_REUSED_EXISTING: "Existing host agent reused (no reinstall)",
  AGENT_SOCKET_TUNNEL_READY:
    "SSH reverse tunnel ready (remote 127.0.0.1 → control panel)",
} as const;
