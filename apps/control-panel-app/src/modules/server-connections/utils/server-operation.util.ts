export const SERVER_OPERATION_METADATA = {
  STATUS: "operationStatus",
  ERROR: "operationError",
} as const;

export const SERVER_OPERATION_STATUS = {
  STARTING: "starting",
  REMOVING: "removing",
  ERROR: "error",
} as const;

export type ServerOperationStatus =
  (typeof SERVER_OPERATION_STATUS)[keyof typeof SERVER_OPERATION_STATUS];

/**
 * Reads the server operation status and error from the metadata.
 */
export function readServerOperationFromMetadata(
  metadata: Record<string, unknown> | null,
): {
  operationStatus: ServerOperationStatus | null;
  operationError: string | null;
} {
  const rawStatus = metadata?.[SERVER_OPERATION_METADATA.STATUS];
  const operationStatus =
    rawStatus === SERVER_OPERATION_STATUS.STARTING ||
    rawStatus === SERVER_OPERATION_STATUS.REMOVING ||
    rawStatus === SERVER_OPERATION_STATUS.ERROR
      ? rawStatus
      : null;

  const rawError = metadata?.[SERVER_OPERATION_METADATA.ERROR];
  const operationError =
    typeof rawError === "string" && rawError.trim() ? rawError.trim() : null;

  return { operationStatus, operationError };
}

/**
 * Builds the server operation metadata.
 */
export function buildServerOperationMetadata(
  current: Record<string, unknown> | null,
  status: ServerOperationStatus | null,
  error?: string | null,
): Record<string, unknown> | null {
  const metadata = { ...(current ?? {}) };

  if (status) {
    metadata[SERVER_OPERATION_METADATA.STATUS] = status;
    if (error?.trim()) {
      metadata[SERVER_OPERATION_METADATA.ERROR] = error.trim();
    } else {
      delete metadata[SERVER_OPERATION_METADATA.ERROR];
    }
  } else {
    delete metadata[SERVER_OPERATION_METADATA.STATUS];
    delete metadata[SERVER_OPERATION_METADATA.ERROR];
  }

  return Object.keys(metadata).length > 0 ? metadata : null;
}
