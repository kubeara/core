export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    body: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export async function apiErrorFromResponse(
  res: Response,
): Promise<ApiError> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* non-JSON error body */
  }
  const message =
    typeof body.error === "string"
      ? body.error
      : res.statusText || "Request failed";
  return new ApiError(message, res.status, body);
}

export async function assertOk(res: Response): Promise<void> {
  if (!res.ok) {
    throw await apiErrorFromResponse(res);
  }
}
