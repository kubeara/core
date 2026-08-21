import { buildApiUrl } from "@/api/axios";
import { extractMessageFromBody } from "@/api/api-error";
import { API_ERROR_MESSAGES } from "@/constants/error-messages";

type SupportPayload = {
  name: string;
  email: string;
  topic: "Support";
  message: string;
};

export async function submitSupportRequest(
  payload: SupportPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(buildApiUrl("/public/support"), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        error:
          extractMessageFromBody(data as Record<string, unknown> | undefined) ??
          API_ERROR_MESSAGES.GENERIC,
      };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: API_ERROR_MESSAGES.NETWORK };
  }
}
