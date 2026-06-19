/** Client wait for POST /servers/onboard (SSH ping + DB write only). */
export const ONBOARD_SERVER_OPERATION_TIMEOUT_MS = 30_000;

/** Client wait for POST /servers/:id/delete to acknowledge removal start. */
export const DELETE_SERVER_OPERATION_TIMEOUT_MS = 30_000;
