export const SERVER_OPERATION_METADATA = {
  STATUS: "operationStatus",
} as const;

export const SERVER_OPERATION_STATUS = {
  STARTING: "starting",
  REMOVING: "removing",
} as const;

export type ServerOperationStatus =
  (typeof SERVER_OPERATION_STATUS)[keyof typeof SERVER_OPERATION_STATUS];

/**
 * Reads the in-progress server operation status from metadata.
 * Errors are persisted in serverError/agentError columns, not metadata.
 */
export function readServerOperationFromMetadata(
  metadata: Record<string, unknown> | null,
): {
  operationStatus: ServerOperationStatus | null;
} {
  const rawStatus = metadata?.[SERVER_OPERATION_METADATA.STATUS];
  const operationStatus =
    rawStatus === SERVER_OPERATION_STATUS.STARTING ||
    rawStatus === SERVER_OPERATION_STATUS.REMOVING
      ? rawStatus
      : null;

  return { operationStatus };
}

/**
 * Builds metadata for an in-progress server operation (starting/removing).
 */
export function buildServerOperationMetadata(
  current: Record<string, unknown> | null,
  status: ServerOperationStatus | null,
): Record<string, unknown> | null {
  const metadata = { ...(current ?? {}) };

  if (status) {
    metadata[SERVER_OPERATION_METADATA.STATUS] = status;
    delete metadata.operationError;
  } else {
    delete metadata[SERVER_OPERATION_METADATA.STATUS];
    delete metadata.operationError;
  }

  return Object.keys(metadata).length > 0 ? metadata : null;
}
